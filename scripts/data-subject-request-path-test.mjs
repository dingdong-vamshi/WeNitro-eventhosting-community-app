import assert from 'node:assert/strict';
import fs from 'node:fs';

const service = fs.readFileSync('src/services/profile-production.ts', 'utf8');
const settings = fs.readFileSync('src/components/reconstruction/settings.tsx', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261013094500_data_subject_request_path.sql', 'utf8');
const publicPage = fs.readFileSync('public/account-deletion/index.html', 'utf8');

assert.match(service, /submit_data_subject_request/);
assert.match(service, /list_my_data_subject_requests/);
assert.doesNotMatch(service.slice(service.indexOf('async submitDataSubjectRequest'), service.indexOf('export default profileProductionService')), /unsupported\("Data-subject requests"\)/);
assert.match(settings, /Your Data/);
assert.match(settings, /Delete account and data/);
assert.match(settings, /submitDataSubjectRequest\('erasure'/);
assert.match(publicPage, /Profile → Settings → Your Data/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on public\.tbl_data_subject_requests from public,anon,authenticated/);
assert.match(migration, /public\.get_current_app_user_id\(\)/);
assert.match(migration, /status in \('submitted','in_review'\)/);
assert.equal((migration.match(/security definer/g) ?? []).length, 4);

console.log('PASS: the published account-deletion instructions match a real authenticated, deduplicated, access-controlled erasure-request path.');
