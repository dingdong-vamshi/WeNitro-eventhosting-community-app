import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const moduleObject = { exports: {} };
const compiled = ts.transpileModule(fs.readFileSync('src/utils/validation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(compiled, { exports: moduleObject.exports, module: moduleObject });
const { validateEmail, validateFullName } = moduleObject.exports;

for (const email of ['name@example.com', ' QA+events@Sub.Example.CO.IN ', "o'hara@example.travel"]) {
  assert.equal(validateEmail(email).valid, true, `expected valid email: ${email}`);
}
for (const email of [
  '',
  'suchitkumar@gmail',
  '.name@example.com',
  'name.@example.com',
  'name..two@example.com',
  'name@example..com',
  'name@-example.com',
  'name@example-.com',
  'name@example.c',
  'name example@example.com',
]) assert.equal(validateEmail(email).valid, false, `expected invalid email: ${email}`);

for (const name of ['Vamshi Pendyala', "D'Arcy", 'Jean-Luc Picard', 'A. B.', 'லட்சுமி தேவி']) {
  assert.equal(validateFullName(name).valid, true, `expected valid name: ${name}`);
}
for (const name of ['', 'A', '--', '..', '-John', 'John-', 'John__Doe', 'John123', 'john@example.com', 'https://example.com', 'Playboy', 'Sex Addict', 'Gamer']) {
  assert.equal(validateFullName(name).valid, false, `expected invalid name: ${name}`);
}

console.log('PASS: strict reusable email and real-name validation edge cases.');
