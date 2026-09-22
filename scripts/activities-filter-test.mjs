import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const exports = {};
const source = fs.readFileSync('src/domain/activity-discovery.ts', 'utf8');
new Function('exports', ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }))(exports);
const { activityDiscoveryInput, activityPriceBadge, dateInputValue } = exports;
const now = new Date('2026-09-22T11:15:00+05:30');
const base = { quickFilter: 'All', categories: [], dateFrom: '', dateTo: '', price: 'All', gender: 'All', verifiedOnly: false };

assert.deepEqual(activityDiscoveryInput(base, now), {
  categories: undefined, startsAfter: undefined, startsBefore: undefined, freeOnly: undefined,
  minPriceInr: undefined, genderPreference: undefined, verifiedOnly: undefined,
});
const selected = activityDiscoveryInput({ ...base, categories: ['Sports'], dateFrom: '2026-09-24', dateTo: '2026-09-26', price: 'Paid', gender: 'Non-binary', verifiedOnly: true }, now);
assert.deepEqual(selected.categories, ['Sports']);
assert.equal(selected.startsAfter, new Date('2026-09-24T00:00:00').toISOString());
assert.equal(selected.startsBefore, new Date('2026-09-26T23:59:59.999').toISOString());
assert.equal(selected.minPriceInr, 0.01);assert.equal(selected.freeOnly, undefined);
assert.equal(selected.genderPreference, 'non_binary');assert.equal(selected.verifiedOnly, true);
const free = activityDiscoveryInput({ ...base, price: 'Free', gender: 'Female' }, now);
assert.equal(free.freeOnly, true);assert.equal(free.minPriceInr, undefined);assert.equal(free.genderPreference, 'female');
const today = activityDiscoveryInput({ ...base, quickFilter: 'Today' }, now);
const todayStart = new Date(now);todayStart.setHours(0,0,0,0);const todayEnd = new Date(todayStart);todayEnd.setDate(todayEnd.getDate()+1);todayEnd.setMilliseconds(-1);
assert.equal(today.startsAfter, todayStart.toISOString());assert.equal(today.startsBefore, todayEnd.toISOString());
const tomorrow = activityDiscoveryInput({ ...base, quickFilter: 'Tomorrow' }, now);
assert.ok(Date.parse(tomorrow.startsAfter)-Date.parse(today.startsAfter) >= 23*60*60*1000);
assert.equal(dateInputValue(new Date(2026, 8, 3)), '2026-09-03');
assert.equal(activityPriceBadge({ price: 'Free' }), 'FREE');
assert.equal(activityPriceBadge({ price: '₹250' }), 'PAID');
assert.equal(activityPriceBadge({ price: 'Free', entryFeeRequired: true }), 'PAID');

const screen = fs.readFileSync('src/components/discovery/activities-screen.tsx', 'utf8');
assert.match(screen, /discoveryRequest\(1, controller\.signal\)/);
assert.match(screen, /discoveryRequest\(page \+ 1\)/);
assert.match(screen, /DateTimePicker/);
assert.match(screen, /activityPriceBadge\(item\)/);
assert.doesNotMatch(screen, /Free to join/);

const service = fs.readFileSync('src/services/activities-production.ts', 'utf8');
assert.match(service, /query = query\.eq\("gender_preference", input\.genderPreference\.trim\(\)\)/);
assert.match(service, /query = query\.eq\("verified_only", input\.verifiedOnly\)/);
assert.match(service, /const latitudeDelta = radiusKm \/ 110\.574/);
assert.match(service, /\.gte\("latitude"/);assert.match(service, /\.lte\("longitude"/);
console.log('PASS: discovery filters map to server query inputs, date bounds are local-day safe, pagination resets/reuses filters, native dates are wired, and list badges are concise.');
