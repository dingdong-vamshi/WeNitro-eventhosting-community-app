import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const exports = {};
new Function('exports', ts.transpile(fs.readFileSync('src/domain/chat-inbox.ts', 'utf8'), {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}))(exports);
const { mergeInboxPreview } = exports;
const history = Array.from({ length: 60 }, (_, index) => ({
  id: String(index + 1), createdAt: new Date(Date.UTC(2026, 8, 24, 0, index)).toISOString(), text: `Message ${index + 1}`,
}));
const snapshot = JSON.stringify(history);
const preview = { id: '61', createdAt: '2026-09-24T01:01:00Z', text: 'New message' };
let merged = mergeInboxPreview(history, [preview]);
assert.equal(merged.length, 61, 'Foreground inbox refresh must preserve paginated thread history');
assert.equal(merged.at(-1).id, '61');
merged = mergeInboxPreview(merged, [{ ...preview, text: 'Edited message' }]);
assert.equal(merged.length, 61, 'Latest preview is deduplicated by ID');
assert.equal(merged.at(-1).text, 'Edited message', 'An updated matching record replaces old content');
merged = mergeInboxPreview(merged, [{ ...preview, text: 'Deleted' }], ['61', '2']);
assert.equal(merged.length, 59);
assert.ok(!merged.some(message => message.id === '61' || message.id === '2'), 'Explicit tombstones remove history and preview records');
assert.deepEqual(mergeInboxPreview(history, []), history, 'An empty preview alone is not a full history deletion event');
assert.deepEqual(mergeInboxPreview([], [preview]), [preview], 'New identities start with only their own preview');
assert.equal(JSON.stringify(history), snapshot, 'Merge never mutates React state inputs');
const app = fs.readFileSync('App.tsx', 'utf8');
const hydration = app.slice(app.indexOf('function hydrateRemoteData'), app.indexOf('function playClickSound'));
assert.match(hydration, /fallback\.mode === "authenticated" && String\(fallback\.userId\) === String\(userId\)/, 'History reuse is restricted to the same authenticated viewer');
assert.match(hydration, /filter\(\(message: any\) => !message\.deleted_at\)/);
console.log('PASS: inbox previews retain loaded history, deduplicate/update records, remove tombstones and isolate accounts.');
