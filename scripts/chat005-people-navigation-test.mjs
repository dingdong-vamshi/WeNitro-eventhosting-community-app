import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const feed = fs.readFileSync('src/components/reconstruction/feed-search.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const feedAst = ts.createSourceFile('feed.tsx', feed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const normalize = feedAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'normalizeSearchScope');
const exported = {};
new Function('exports', ts.transpile(normalize.getText(feedAst), {module: ts.ModuleKind.CommonJS}))(exported);
for (const [input, expected] of [[undefined, 'Activities'], ['People', 'People'], ['Communities', 'Communities'], ['invalid', 'Activities']]) {
  assert.equal(exported.normalizeSearchScope(input), expected);
}
const appAst = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = appAst.statements.filter(ts.isVariableStatement).flatMap(n => [...n.declarationList.declarations]);
const source = ['readWebRoute', 'webHashFor'].map(name => `const ${declarations.find(n => n.name.getText(appAst) === name).getText(appAst)};`).join('\n');
const window = {location: {hash: ''}};
const routes = new Function('Platform', 'window', 'routableScreens', ts.transpile(`${source}\nreturn {readWebRoute, webHashFor};`, {target: ts.ScriptTarget.ES2022}))({OS: 'web'}, window, new Set(['search', 'feed']));
for (const scope of [undefined, 'People', 'Communities']) {
  window.location.hash = routes.webHashFor('search', scope);
  assert.deepEqual(routes.readWebRoute(), {screen: 'search', entityId: scope}, 'Search scope survives reload and browser history');
}
assert.match(feed, /action="Find people" onAction=\{\(\) => go\('search', 'People'\)\}/);
assert.match(feed, /useState<SearchScope>\(\(\) => normalizeSearchScope\(initialScope\)\)/);
assert.match(app, /if \(next === "search"\) setInitialSearchScope\(entityId\)/);
assert.match(app, /setInitialSearchScope\(route.screen === "search" \? route.entityId : undefined\)/);
assert.match(app, /<ReferenceSearch key=\{initialSearchScope \|\| 'Activities'\} initialScope=\{initialSearchScope\}/);
console.log('PASS: Find people opens People; normal Search defaults to Activities; scoped routes survive reload/back; invalid scope falls back safely.');
