import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Execute the actual component's independent fetch effects with controllable
// completions. No browser, production requests, or records are involved.
const source = fs.readFileSync('src/components/partner-dashboard.tsx', 'utf8');
const parsed = ts.createSourceFile('dashboard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(parsed) === 'useEffect') callbacks.push(node.arguments[0].getText(parsed));
  ts.forEachChild(node, visit);
}
visit(parsed);
const summaryEffect = callbacks.find(text => text.includes('partnerProductionService.dashboard()'));
const ledgerEffect = callbacks.find(text => text.includes('partnerProductionService.registrations(selectedId)'));
assert.ok(summaryEffect && ledgerEffect);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(tab = 'Registrations') {
  const summary = deferred(), ledger = deferred();
  const state = { summaryError: '', detailError: '', error: '', dashboard: null, registrations: [], transactions: [] };
  const bindings = {
    tab, selectedId: 12, userId: '7',
    partnerProductionService: {
      dashboard: () => summary.promise,
      registrations: () => ledger.promise,
      transactions: () => ledger.promise,
    },
    subscribeToAppForeground: () => () => {}, setRevision: () => {},
  };
  for (const key of ['summaryError', 'detailError', 'error', 'dashboard', 'registrations', 'transactions', 'loading', 'detailLoading']) {
    bindings[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { state[key] = value; };
  }
  const run = callback => new Function(...Object.keys(bindings), ts.transpile(`const effect = ${callback}; effect();`, { target: ts.ScriptTarget.ES2022 }))(...Object.values(bindings));
  run(summaryEffect); run(ledgerEffect);
  return { state, summary, ledger };
}

for (const tab of ['Registrations', 'Earnings']) {
  const { state, summary, ledger } = harness(tab);
  ledger.reject(new Error('Ledger temporarily unavailable'));
  await flush();
  assert.equal(state.detailError, 'Ledger temporarily unavailable');
  summary.resolve({ summary: {}, activities: [] });
  await flush();
  assert.equal(state.detailError, 'Ledger temporarily unavailable', 'Late summary success must not hide a failed ledger');
  assert.equal(state.summaryError, '');
  assert.equal(state.detailLoading, false);
}
{
  const { state, summary, ledger } = harness();
  summary.reject(new Error('Summary temporarily unavailable'));
  await flush();
  ledger.resolve([{ participant_id: 1 }]);
  await flush();
  assert.equal(state.summaryError, 'Summary temporarily unavailable', 'Ledger success must not hide summary failure');
  assert.equal(state.registrations.length, 1);
}
{
  const { state, summary } = harness('Overview');
  summary.resolve({ summary: {}, activities: [] });
  await flush();
  assert.equal(state.detailLoading, false);
  assert.equal(state.summaryError, '');
}
assert.match(source, /!registrations\.length[^\n]+!summaryError && !detailError/);
assert.match(source, /!transactions\.length[^\n]+!summaryError && !detailError/);
console.log('PASS: actual Partner Dashboard fetch effects preserve independent summary/ledger failures in either completion order, retain successful data, and suppress false empty states.');
