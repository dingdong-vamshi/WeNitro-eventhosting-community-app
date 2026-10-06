import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('src/services/profile-about.ts', 'utf8');
const output = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const exports = {};
new Function('exports', output)(exports);
const { selectAboutProfilePhoto } = exports;

assert.equal(selectAboutProfilePhoto([]), null, 'zero photos uses the profile illustration');
assert.equal(selectAboutProfilePhoto([{ uri: 'primary-a', position: 1 }]), 'primary-a', 'one photo is shown');
assert.equal(selectAboutProfilePhoto([{ uri: 'primary-a', position: 1 }, { uri: 'second', position: 2 }]), 'second', 'a secondary photo avoids repeating the avatar');
assert.equal(selectAboutProfilePhoto([{ uri: 'third', position: 3 }, { uri: 'primary-a', position: 1 }, { uri: 'second', position: 2 }]), 'second', 'selection is stable regardless of input order');
assert.equal(selectAboutProfilePhoto([{ uri: 'primary-a', position: 1 }, { uri: 'third', position: 3 }]), 'third', 'deleting the selected photo selects the next gallery photo');
assert.equal(selectAboutProfilePhoto([{ uri: 'primary-b', position: 1 }]), 'primary-b', 'changing the only/primary photo updates the selection');
assert.equal(selectAboutProfilePhoto([{ uri: ' ', position: 2 }]), null, 'blank or deleted photos are ignored');

const component = fs.readFileSync('src/components/reconstruction/profile.tsx', 'utf8');
assert.match(component, /selectAboutProfilePhoto\(photos\)/);
assert.match(component, /resizeMode="cover"/);
assert.match(component, /onError=\{\(\) => setFailed\(true\)\}/);
assert.doesNotMatch(component, /ProfileLandscape/);

console.log('profile About image checks passed: 11');
