import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync('src/lib/avatar-fallback.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { avatarInitials, avatarFallbackColor } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
assert.equal(avatarInitials('Arjun Rao'), 'AR');
assert.equal(avatarInitials('[QA] User'), 'QU');
assert.equal(avatarInitials('  '), '?');
assert.equal(avatarInitials('Élodie 李'), 'É李');
assert.equal(avatarFallbackColor('91'), avatarFallbackColor('91'));
assert.ok(new Set(Array.from({ length: 40 }, (_, id) => avatarFallbackColor(String(id)))).size >= 6);
for (const color of new Set(Array.from({ length: 40 }, (_, id) => avatarFallbackColor(String(id))))) {
 const rgb = color.slice(1).match(/../g).map(hex => parseInt(hex, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
 const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
 assert.ok(1.05 / (luminance + .05) >= 4.5, `${color} must contrast with white initials`);
}
console.log('PASS: deterministic avatar colors, unicode initials, identity variation and WCAG AA text contrast');
