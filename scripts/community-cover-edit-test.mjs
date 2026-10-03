import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = ts.createSourceFile('community.tsx', fs.readFileSync('src/components/community/reference-community.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'CreateCommunitySheet');
const state = [], refs = [], patches = []; let cursor = 0, refCursor = 0, tree, saved, picked = 0;
const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
const useState = initial => { const key = cursor++; if (!(key in state)) state[key] = initial; return [state[key], next => { state[key] = typeof next === 'function' ? next(state[key]) : next; }]; };
const initial = { id: '252', name: 'Camera Crew', description: 'A photo community.', category: 'Creative', rules: [{ body: 'Be kind' }], visibility: 'public', imageUrl: 'old-avatar.jpg', coverUrl: 'old-cover.jpg' };
const deps = { React: react, useState, useRef: value => refs[refCursor++] ||= { current: value }, useEffect: () => {}, useCommunityStyles: () => ({ c: {}, s: {} }), useActivityCategories: () => ({ names: ['Creative'] }), useSafeAreaInsets: () => ({ top: 0, bottom: 0 }), RULES: [], Platform: { OS: 'web' }, Keyboard: { dismiss() {} }, errorText: error => error.message,
 ImagePicker: { requestMediaLibraryPermissionsAsync: async () => ({ granted: true }), launchImageLibraryAsync: async () => { picked++; return { canceled: false, assets: [{ uri: 'picked-cover.jpg', fileSize: 1000 }] }; } }, editCommunity: async (id, patch) => { patches.push({ id, patch }); },
 ...Object.fromEntries(['Modal','MobileOverlayFrame','KeyboardAvoidingView','View','Text','TextInput','Pressable','ScrollView','Icon','Image','ActivityIndicator','Sheet','Button','CoverEditor','CategoryCatalogStatus'].map(name => [name, name])),
};
const exported = {};
new Function('exports', ...Object.keys(deps), ts.transpile(component.getText(source), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }))(exported, ...Object.values(deps));
const render = () => { cursor = 0; refCursor = 0; tree = exported.CreateCommunitySheet({ initial, onClose() {}, onCreated(value) { saved = value; } }); };
const all = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(!Array.isArray(node) && predicate(node) ? [node] : []), ...(Array.isArray(node) ? node : node.children || []).flatMap(child => all(child, predicate))];
const find = predicate => all(tree, predicate)[0];
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
render();
const cover = find(node => node.props.accessibilityLabel === 'Change community cover image'); assert.ok(cover, 'Existing community exposes cover edit');
cover.props.onPress(); render();
find(node => node.type === 'Button' && node.props.label === 'Continue').props.onPress(); await settle();
assert.equal(picked, 1);
const crop = find(node => node.type === 'CoverEditor'); assert.equal(crop.props.square, false); crop.props.onSave('cropped-cover.jpg'); render();
const save = find(node => node.type === 'Pressable' && all(node, item => item.type === 'Text' && item.children.includes('Save Changes')).length); save.props.onPress(); await settle();
assert.equal(patches.length, 1); assert.equal(patches[0].id, '252'); assert.equal(patches[0].patch.cover, 'cropped-cover.jpg'); assert.equal(patches[0].patch.avatar, undefined, 'Cover edit does not replace avatar');
assert.equal(saved.cover, 'cropped-cover.jpg'); assert.equal(saved.id, '252');
console.log('PASS actual existing-Community component: reachable cover picker, responsibility confirmation, crop, preview state, edit service patch, saved callback; avatar preserved');
