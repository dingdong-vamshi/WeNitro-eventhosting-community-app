import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

const url = process.env.QA_SUPABASE_URL?.trim();
const key = process.env.QA_SUPABASE_PUBLISHABLE_KEY?.trim();
const email = process.env.QA_EMAIL_1?.trim();
const password = process.env.QA_PASSWORD_1;
const expectedHost = process.env.QA_EXPECTED_SUPABASE_HOST?.trim();
const rounds = Number.parseInt(process.env.QA_STABILITY_ROUNDS || '5', 10);

assert.ok(url && key && email && password && expectedHost, 'Set the target QA Supabase URL, publishable key, expected host, and QA credentials');
assert.equal(new URL(url).hostname, expectedHost, 'Refusing to run against an unexpected Supabase project');
assert.ok(Number.isInteger(rounds) && rounds > 0 && rounds <= 20, 'QA_STABILITY_ROUNDS must be between 1 and 20');

const observations = [];
const trackedFetch = async (input, init) => {
  const requestUrl = typeof input === 'string' ? input : input.url;
  const started = performance.now();
  try {
    const response = await fetch(input, init);
    if (new URL(requestUrl).hostname === expectedHost) {
      observations.push({ status: response.status, latencyMs: performance.now() - started });
    }
    return response;
  } catch (error) {
    observations.push({ status: 0, latencyMs: performance.now() - started });
    throw error;
  }
};

const checks = [
  ['profile', client => client.from('tbl_users').select('id').limit(1)],
  ['activities', client => client.from('tbl_events').select('id').limit(5)],
  ['communities', client => client.from('tbl_chat_rooms').select('id').eq('room_type', 'community').limit(5)],
  ['community posts', client => client.from('tbl_community_posts').select('id').limit(5)],
  ['vibes', client => client.from('tbl_activity_vibes').select('id').limit(5)],
  ['stories', client => client.from('tbl_stories').select('id').limit(5)],
  ['notifications', client => client.from('tbl_notifications').select('id').limit(5)],
  ['identity bridge', client => client.rpc('get_current_app_user_id')],
];

let realtime = 'not-run';
for (let round = 1; round <= rounds; round += 1) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: trackedFetch },
  });
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  for (const [name, execute] of checks) {
    const result = await execute(client);
    assert.ifError(result.error, `${name} failed in round ${round}`);
  }
  if (round === 1) {
    realtime = await new Promise(resolve => {
      const channel = client.channel(`stability-${Date.now()}`).on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tbl_messages' },
        () => undefined,
      );
      const deadline = setTimeout(() => resolve('timeout'), 10_000);
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(deadline);
          resolve(status.toLowerCase());
        }
      });
    });
    await client.removeAllChannels();
  }
  const logout = await client.auth.signOut();
  assert.ifError(logout.error);
  console.log(`PASS: authenticated cold round ${round}/${rounds}`);
}

const statusCounts = observations.reduce((counts, item) => {
  counts[item.status] = (counts[item.status] || 0) + 1;
  return counts;
}, {});
const total = observations.length;
const success = observations.filter(item => item.status >= 200 && item.status < 300).length;
const clientErrors = observations.filter(item => item.status >= 400 && item.status < 500).length;
const serverErrors = observations.filter(item => item.status >= 500).length;
const worstLatencyMs = Math.round(Math.max(0, ...observations.map(item => item.latencyMs)));

assert.equal(serverErrors, 0, `Observed server failures: ${JSON.stringify(statusCounts)}`);
assert.equal(clientErrors, 0, `Observed client failures: ${JSON.stringify(statusCounts)}`);
assert.equal(realtime, 'subscribed', `Realtime did not subscribe: ${realtime}`);
console.log(JSON.stringify({ rounds, requests: total, success, clientErrors, serverErrors, statusCounts, realtime, worstLatencyMs }, null, 2));
