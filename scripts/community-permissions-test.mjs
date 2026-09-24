import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the production mapper without a Supabase connection or network calls.
const source = fs.readFileSync('src/services/communities-production.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = {
  exports: {},
  require(name) {
    assert.equal(name, '../lib/supabase', `Unexpected runtime dependency: ${name}`);
    return { isSupabaseConfigured: false, supabase: null };
  },
};
vm.runInNewContext(compiled, sandbox, { filename: 'communities-production.js' });
const permissions = (...args) => JSON.parse(JSON.stringify(sandbox.exports.communityPermissions(...args)));
const none = { can_approve: false, can_post: false, can_edit: false, can_manage_roles: false };
const all = { can_approve: true, can_post: true, can_edit: true, can_manage_roles: true };

const cases = [
  ['normal member cannot acquire authority from stored flags', ['member', false, all], none],
  ['non-member cannot acquire authority from stored flags', [null, false, all], none],
  ['moderator gets only approval and posting grants', ['moderator', false, { can_approve: true, can_post: true }], { ...none, can_approve: true, can_post: true }],
  ['moderator gets only editing and role-management grants', ['moderator', false, { can_edit: true, can_manage_roles: true }], { ...none, can_edit: true, can_manage_roles: true }],
  ['truthy strings are not permission grants', ['moderator', false, { can_approve: 'true', can_post: 'true', can_edit: 'true', can_manage_roles: 'true' }], none],
  ['co-admin receives server-defined full authority', ['admin', false, {}], all],
  ['legacy creator role receives full authority', ['creator', false, {}], all],
  ['room owner retains authority regardless of participant role', ['member', true, {}], all],
];
for (const [name, input, expected] of cases) {
  assert.deepEqual(permissions(...input), expected, name);
}

// Keep the production fetch/mapping and UI consumers wired to these capabilities.
assert.match(source, /select\("room_id,role,permissions"\)/);
assert.match(source, /permissions: communityPermissions\(/);
const info = fs.readFileSync('src/components/community/community-info.tsx', 'utf8');
for (const permission of ['can_edit', 'can_approve', 'can_manage_roles']) {
  assert.ok(info.includes(`community?.permissions.${permission}`), `Info UI must consume ${permission}`);
}
const screen = fs.readFileSync('src/components/community/reference-community.tsx', 'utf8');
assert.equal((screen.match(/!community\.adminsOnly \|\| community\.permissions\.can_post/g) || []).length, 2, 'Initial and refreshed posting controls must use the same permission gate');

console.log(`PASS: ${cases.length} community permission cases plus fetch/UI wiring; no database writes or network calls.`);
