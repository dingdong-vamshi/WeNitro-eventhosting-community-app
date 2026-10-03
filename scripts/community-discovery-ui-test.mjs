import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Execute the reachable App component with a tiny state renderer. No browser,
// network or string-contract assertions: presses exercise the real handlers.
const source = ts.createSourceFile('App.tsx', fs.readFileSync('App.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'CommunitiesScreen');
assert.ok(component);
const state = []; let cursor = 0; let tree;
const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), useContext: () => ({ notifications: 3 }) };
const useState = initial => { const key = cursor++; if (!(key in state)) state[key] = initial; return [state[key], next => { state[key] = typeof next === 'function' ? next(state[key]) : next; }]; };
const symbols = Object.fromEntries(['SafeAreaView','ScrollView','View','Text','TextInput','Pressable','Icon','Image','UserAvatar','BrandBar','LinearGradient'].map(name => [name, name]));
const props = { data: { communities: [
  { id: '1', name: 'Camera Crew', category: 'Creative', tags: ['photo'], membership: 'joined', memberCount: 2 },
  { id: '2', name: 'Morning Runners', category: 'Fitness', tags: ['run'], membership: 'created', memberCount: 3 },
  { id: '3', name: 'Camera Hikes', category: 'Fitness', tags: ['photo'], membership: 'none', memberCount: 1 },
]}, setData: () => {}, go: value => navigations.push(value), openCommunity: value => opens.push(value) };
const navigations = [], opens = [];
const deps = { React, useState, usePalette: () => ({}), UnreadContext: {}, styles: {}, ...symbols };
const exported = {};
new Function('exports', ...Object.keys(deps), ts.transpile(component.getText(source), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }))(exported, ...Object.values(deps));
const render = () => { cursor = 0; tree = exported.CommunitiesScreen(props); };
const all = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(!Array.isArray(node) && predicate(node) ? [node] : []), ...(Array.isArray(node) ? node : node.children || []).flatMap(child => all(child, predicate))];
const find = label => all(tree, node => node.props?.accessibilityLabel === label)[0];
const press = label => { const control = find(label); assert.ok(control, label); control.props.onPress(); render(); };
const cards = () => all(tree, node => node.props?.accessibilityLabel?.endsWith(' details')).map(node => node.props.accessibilityLabel);
render();
assert.equal(find('Search communities'), undefined, 'Search is initially hidden');
assert.equal(cards().length, 3);
const brand = all(tree, node => node.type === 'BrandBar')[0];
assert.equal(brand.props.notificationCount, 3);
brand.props.go('notifications'); assert.deepEqual(navigations, ['notifications']);
brand.props.go('search'); render(); assert.ok(find('Search communities'));
find('Search communities').props.onChangeText('cAmErA'); render();
assert.deepEqual(cards(), ['Open community Camera Crew details', 'Open community Camera Hikes details']);
press('Filter communities by category'); press('Community category Fitness');
assert.deepEqual(cards(), ['Open community Camera Hikes details'], 'Text and category filters compose');
press('Open community Camera Hikes details'); assert.deepEqual(opens, ['3']);
press('Close community search'); assert.equal(find('Search communities'), undefined); assert.equal(cards().length, 3, 'Close clears search/category and restores list');
assert.equal(all(tree, node => node.type === 'UserAvatar').length, 6, 'Empty images have real identity fallbacks in story and card entries');
console.log('PASS Community discovery actual component: hidden search, logo-header actions, category/text filtering, close/reset, correct detail route, image fallback');
