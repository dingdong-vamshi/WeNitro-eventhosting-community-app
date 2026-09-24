import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const queries = [];
const memberships = Array.from({ length: 125 }, (_, index) => ({
  id: index + 1, event_id: index + 1, user_id: 44, status: index === 0 ? 'paid' : 'approved', created_at: '2025-01-01',
}));
memberships.push({ id: 9000, event_id: 9000, user_id: 77, status: 'approved' });
const events = Array.from({ length: 125 }, (_, index) => ({
  id: index + 1, created_by: 77, title: `Joined event ${index + 1}`, status: 'completed', visibility_type: 'private',
  event_start_time: '2025-01-01T09:00:00Z', event_end_time: '2025-01-01T10:00:00Z', is_deleted: false, is_cancelled: false,
}));
// Sparse first page: deleted records/owner activity must not suppress later pages.
events.at(-1).is_deleted = true;
events.at(-2).created_by = 44;
events.push(...Array.from({ length: 140 }, (_, index) => ({
  id: index + 10000, created_by: 77, title: 'Unrelated discovery event', status: 'published',
  event_start_time: '2026-09-24T09:00:00Z', is_deleted: false, is_cancelled: false,
})));
let failMemberships = false;
const backend = {
  auth: { getUser: async () => ({ data: { user: { id: 'auth44' } }, error: null }) },
  rpc: async name => {
    assert.equal(name, 'get_current_app_user_id'); return { data: 44, error: null };
  },
  from(table) {
    const query = { table, filters: [], orders: [], window: null, columns: '' }; queries.push(query);
    const builder = {
      select(columns) { query.columns = columns; return this; },
      eq(column, value) { query.filters.push(row => row[column] === value); return this; },
      neq(column, value) { query.filters.push(row => row[column] !== value); return this; },
      in(column, values) { query.filters.push(row => values.includes(row[column])); if (column === 'id') query.requestedIds = values; return this; },
      order(column, options) { query.orders.push({ column, ascending: options.ascending }); return this; },
      range(from, to) { query.window = [from, to]; return this; },
      abortSignal() { return this; },
      then(resolve, reject) {
        if (table === 'tbl_event_participants' && failMemberships) return Promise.resolve({ data: null, count: null, error: new Error('membership offline') }).then(resolve, reject);
        let rows = table === 'tbl_event_participants' ? memberships : table === 'tbl_events' ? events : table === 'tbl_users' ? [{ id: 77, username: 'other' }] : [];
        rows = rows.filter(row => query.filters.every(filter => filter(row)));
        rows = [...rows].sort((a, b) => { for (const order of query.orders) { const result = a[order.column] < b[order.column] ? -1 : a[order.column] > b[order.column] ? 1 : 0; if (result) return order.ascending ? result : -result; } return 0; });
        const count = rows.length;
        if (query.window) rows = rows.slice(query.window[0], query.window[1] + 1);
        return Promise.resolve({ data: rows, count, error: null }).then(resolve, reject);
      },
    };
    return builder;
  },
};
const compiled = ts.transpile(fs.readFileSync('src/services/activities-production.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const exports = {};
new Function('exports', 'require', compiled)(exports, name => {
  if (name === '../lib/supabase') return { supabase: backend, isSupabaseConfigured: true };
  if (name === './registration-questions') return {};
  throw new Error(`Unexpected dependency ${name}`);
});
const service = exports.activitiesProductionService;
const first = await service.listJoined({ page: 1, pageSize: 20 });
assert.equal(first.total, 125);
assert.equal(first.items.length, 18);
assert.equal(first.hasMore, true, 'A sparse event page still advances through memberships');
assert.ok(first.items.every(item => item.ownerId === '77' && item.status === 'completed' && item.visibility === 'private'));
const ids = new Set(first.items.map(item => item.id));
let page = first;
while (page.hasMore) { page = await service.listJoined({ page: page.page + 1, pageSize: 20 }); for (const item of page.items) ids.add(item.id); }
assert.equal(page.page, 7);
assert.equal(page.hasMore, false);
assert.equal(ids.size, 123);
assert.ok(ids.has('1'), 'An older joined activity remains reachable beyond the latest 100 discovery events');
assert.ok(!ids.has('9000'), 'Another user’s membership is excluded');
assert.ok(queries.filter(q => q.table === 'tbl_events').every(q => q.requestedIds.length <= 20 && q.requestedIds.every(id => id < 10000)), 'Every event read is bounded to actual membership IDs');
assert.ok(queries.filter(q => q.table === 'tbl_event_participants').every(q => q.window && q.window[1] - q.window[0] < 20), 'Membership reads are paginated');
assert.equal(page.items.find(item => item.id === '1').viewerState.participation.rawStatus, 'paid', 'History preserves the exact confirmed payment status');
assert.equal(page.items.find(item => item.id === '1').viewerState.participation.status, 'going', 'Confirmed paid registration maps to joined viewer state');

const publicIds = new Set();
let publicPage = await service.listPublicHosted('77', { page: 1, pageSize: 20 });
assert.equal(publicPage.total, 263);
assert.ok(publicPage.items.every(item => item.ownerId === '77'));
while (true) {
  publicPage.items.forEach(item => publicIds.add(item.id));
  if (!publicPage.hasMore) break;
  publicPage = await service.listPublicHosted('77', { page: publicPage.page + 1, pageSize: 20 });
}
assert.equal(publicIds.size, 263);
assert.ok(publicIds.has('1'), 'Explicitly completed public-profile hosted activity remains reachable beyond page 50');
await assert.rejects(() => service.listPublicHosted('invalid'), /Profile owner ID/);

const historyLabels = {};
new Function('exports', ts.transpile(fs.readFileSync('src/domain/profile-activity-history.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }))(historyLabels);
for (const status of ['approved', 'going', 'paid']) {
  assert.equal(historyLabels.confirmedActivityParticipation(status), true);
  assert.equal(historyLabels.activityHistoryParticipationLabel(status), 'Joined');
}
for (const status of ['pending', 'payment_required', 'approved_pending_payment', 'payment_pending', 'payment_failed', 'left', 'rejected', 'declined', 'waitlist', 'interested']) {
  assert.equal(historyLabels.confirmedActivityParticipation(status), false);
  assert.notEqual(historyLabels.activityHistoryParticipationLabel(status), 'Joined');
}
assert.equal(historyLabels.activityHistoryParticipationLabel('payment_required'), 'Payment required');
assert.equal(historyLabels.activityHistoryParticipationLabel('left'), 'Left activity');
failMemberships = true;
await assert.rejects(() => service.listJoined(), /membership offline/);
console.log('PASS: paginated older/private/completed joined and public hosted history; sparse pages, exact payment/participation labels, owner/account scope and retryable failures. No remote writes.');
