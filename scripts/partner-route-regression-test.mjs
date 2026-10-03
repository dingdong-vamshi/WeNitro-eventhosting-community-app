import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile = source => ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React });
const parse = (name, source) => ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const gateSource = fs.readFileSync('src/components/partner-access-gate.tsx', 'utf8');
const gateAst = parse('gate.tsx', gateSource);
let gateEffect;
function visit(node, callback) { callback(node); ts.forEachChild(node, child => visit(child, callback)); }
visit(gateAst, node => { if (ts.isCallExpression(node) && node.expression.getText(gateAst) === 'useEffect') gateEffect = node.arguments[0].getText(gateAst); });
assert.ok(gateEffect);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function gate(userId = '71') {
 const request = deferred(), result = { state: 'loading', error: '', resolved: [] }, timers = new Map(); let nextTimer = 0;
 const deadline = {}; new Function('exports', 'setTimeout', 'clearTimeout', compile(fs.readFileSync('src/services/request-deadline.ts', 'utf8')))(deadline, fn => { const id = ++nextTimer; timers.set(id, fn); return id; }, id => timers.delete(id));
 const deps = { userId, partnerAccountService: { get: () => request.promise }, withRequestDeadline: deadline.withRequestDeadline,
 setState: value => { result.state = value; }, setError: value => { result.error = value; }, resolved: { current: value => result.resolved.push(value) } };
 const cleanup = new Function(...Object.keys(deps), compile(`const effect = ${gateEffect}; return effect();`))(...Object.values(deps));
 return { request, result, cleanup, timeout: () => { for (const fn of timers.values()) fn(); } };
}
const approved = { can_host_paid: true, profile: { user_id: 71, status: 'APPROVED' }, eligible: true };
let current = gate(); assert.equal(current.result.state, 'loading'); current.request.resolve(approved); await flush();
assert.equal(current.result.state, 'allowed', 'Approved Partner cold route does not depend on Profile hydration'); assert.deepEqual(current.result.resolved, [approved]); current.cleanup();
current = gate(); current.request.resolve({ can_host_paid: false, profile: null }); await flush(); assert.equal(current.result.state, 'denied'); current.cleanup();
current = gate(); current.request.reject(Error('Temporary role lookup failure')); await flush(); assert.equal(current.result.state, 'error'); assert.match(current.result.error, /Temporary/); current.cleanup();
current = gate(); await flush(); current.timeout(); await flush(); assert.equal(current.result.state, 'error'); assert.match(current.result.error, /too long/); current.cleanup();
current = gate(); await flush(); current.cleanup(); current.request.resolve(approved); await flush(); assert.equal(current.result.state, 'loading'); assert.deepEqual(current.result.resolved, [], 'Disposed account cannot hydrate Partner role');
current = gate('120'); current.request.resolve(approved); await flush(); assert.equal(current.result.state, 'error'); assert.deepEqual(current.result.resolved, []); current.cleanup();
// Retry mounts a fresh effect and succeeds after an earlier denial/error.
current = gate(); current.request.resolve(approved); await flush(); assert.equal(current.result.state, 'allowed'); current.cleanup();

// Execute App's actual Partner JSX branch. A different route ID/account changes
// the React reconciliation key, which disposes old ledgers before mounting new initial state.
const appSource = fs.readFileSync('App.tsx', 'utf8'), appAst = parse('App.tsx', appSource);
let routeBranch, contentMemo;
visit(appAst, node => {
 if (ts.isIfStatement(node) && node.expression.getText(appAst).includes('screen === "partnerDashboard" || screen === "partnerRegistrationForm"') && node.thenStatement.getText(appAst).includes('<PartnerAccessGate')) routeBranch = node.getText(appAst);
 if (ts.isCallExpression(node) && node.expression.getText(appAst) === 'useMemo' && node.arguments[0]?.getText(appAst).includes('<PartnerAccessGate')) contentMemo = node;
});
assert.ok(routeBranch && contentMemo);
assert.ok(contentMemo.arguments[1].elements.some(item => item.getText(appAst) === 'partnerActivityId'), 'Memo rerenders on route ID alone');
const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
const render = new Function('React', 'PartnerAccessGate', 'PartnerDashboard', 'PartnerRegistrationFormScreen', 'data', 'screen', 'partnerActivityId', 'back', 'setData', 'setPartnerActivityId', 'go', 'openActivity', compile(routeBranch));
const no = () => {};
const route = (id, userId = '71', screen = 'partnerDashboard') => render(React, 'Access', 'Dashboard', 'Form', { userId, theme: 'light', accountType: undefined }, screen, id, no, no, no, no, no);
const a = route('280'), b = route('297'), overview = route(undefined), other = route('297', '120');
assert.ok(a, 'Direct route must render the gate even when cached accountType is unknown');
assert.notEqual(a.props.key, b.props.key); assert.notEqual(b.props.key, overview.props.key); assert.notEqual(b.props.key, other.props.key);
assert.equal(a.children[0].props.initialActivityId, '280'); assert.equal(b.children[0].props.initialActivityId, '297');
assert.equal(route('297', '71', 'partnerRegistrationForm').children[0].props.activityId, '297');
// Execute actual Dashboard ledger effects around the keyed route transition;
// late results from 280 cannot overwrite the new 297 ledger.
const dashboardSource = fs.readFileSync('src/components/partner-dashboard.tsx', 'utf8'), dashboardAst = parse('dashboard.tsx', dashboardSource);
let ledger;
visit(dashboardAst, node => { if (ts.isCallExpression(node) && node.expression.getText(dashboardAst) === 'useEffect' && node.arguments[0]?.getText(dashboardAst).includes('partnerProductionService.registrations(selectedId)')) ledger = node.arguments[0].getText(dashboardAst); });
const rows = [], calls = [], oldRequest = deferred(), nextRequest = deferred();
function runLedger(id, request) {
 const deps = { selectedId: id, tab: 'Registrations', setDetailError: no, setDetailLoading: no, setRegistrations: value => rows.push(value), setTransactions: no,
 partnerProductionService: { registrations: actualId => { calls.push(actualId); return request.promise; } } };
 return new Function(...Object.keys(deps), compile(`const effect = ${ledger}; return effect();`))(...Object.values(deps));
}
const stopOld = runLedger(Number(a.children[0].props.initialActivityId), oldRequest); stopOld();
const stopNew = runLedger(Number(b.children[0].props.initialActivityId), nextRequest);
nextRequest.resolve([{ event_id: 297 }]); oldRequest.resolve([{ event_id: 280 }]); await flush();
assert.deepEqual(calls, [280, 297]); assert.deepEqual(rows, [[{ event_id: 297 }]]); stopNew();
console.log('PASS: actual Partner access effect cold-role lookup/loading/denial/error/timeout/cleanup, route JSX keys and props280→297, memo dependency, actual old-ledger disposal. All network mocked.');
