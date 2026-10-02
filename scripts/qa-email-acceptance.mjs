// Live TARGET-only QA. Creates one clearly labelled harmless activity using
// supplied regular-user credentials; never elevates users or edits Auth records.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, 'cxsznhrkzqndhseodcyy.supabase.co');
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const clients = [1, 2].map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
const first = value => Array.isArray(value) ? value[0] : value;
const rpc = async (client, name, args = {}) => {
  const { data, error } = await client.rpc(name, args);
  if (error) throw Error(`${name}: ${error.message}`);
  return first(data);
};
let checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };
let eventId;
try {
  const ids = [];
  for (let index = 0; index < clients.length; index++) {
    const n = index + 1;
    assert(process.env[`QA_EMAIL_${n}`] && process.env[`QA_PASSWORD_${n}`], `Missing QA ${n} credentials`);
    const { data, error } = await clients[index].auth.signInWithPassword({ email: process.env[`QA_EMAIL_${n}`], password: process.env[`QA_PASSWORD_${n}`] });
    assert.ifError(error);
    assert(data.session && data.user.email_confirmed_at);
    ids.push(Number(await rpc(clients[index], 'get_current_app_user_id')));
    pass(`QA ${n} confirmed-email login and target identity bridge`);
  }
  const [host, member] = clients;
  const start = new Date(Date.now() + 48 * 60 * 60 * 1000), end = new Date(start.getTime() + 3600000);
  const created = await rpc(host, 'create_activity', { p_payload: {
    title: `[QA] Acceptance email lifecycle ${new Date().toISOString()}`,
    description: 'Harmless client acceptance fixture; no payment or real attendance expected.',
    category: 'Social', event_start_time: start.toISOString(), event_end_time: end.toISOString(),
    registration_close_time: start.toISOString(), max_participants: 4,
    visibility_type: 'public', join_type: 'approval', location: 'QA test venue', display_location: 'QA test venue',
    is_paid: false, price_inr: 0, payment_collection_mode: 'none', activity_type: 'social',
  }, p_status: 'published' });
  eventId = Number(created?.id ?? created);
  assert(eventId > 0); pass('Email-authenticated host can create a free activity');
  const participation = async () => {
    const response = await host.from('tbl_event_participants').select('id,user_id,status,role').eq('event_id', eventId).eq('user_id', ids[1]);
    assert.ifError(response.error); assert.equal(response.data.length, 1); return response.data[0];
  };
  const join = status => rpc(member, 'request_join_activity', { p_event_id: eventId, p_status: status });
  const respond = status => rpc(host, 'respond_activity_join', { p_event_id: eventId, p_user_id: ids[1], p_status: status });
  assert.equal((await join('going')).status, 'pending'); pass('Join appears pending for approval');
  assert.equal((await respond('rejected')).status, 'rejected'); pass('Host reject persists');
  assert.equal((await join('going')).status, 'pending'); pass('Rejected participant can request again');
  assert.equal((await respond('approved')).status, 'approved'); pass('Host approval persists');
  const originalId = (await participation()).id;
  assert.equal((await join('left')).status, 'left'); pass('Participant can leave upcoming activity');
  assert.equal((await join('going')).status, 'pending');
  assert.equal((await participation()).id, originalId); pass('Leave/rejoin restores one pending relationship, without duplicates');
  await respond('approved');
  assert.equal((await rpc(host, 'set_activity_cohost', { p_event_id: eventId, p_user_id: ids[1], p_cohost: true })).role, 'cohost');
  await rpc(member, 'update_activity', { p_event_id: eventId, p_patch: { description: 'Harmless QA edit by promoted Co-host.' } });
  const creator = await host.from('tbl_events').select('created_by,description').eq('id', eventId).single();
  assert.ifError(creator.error); assert.equal(creator.data.created_by, ids[0]);
  assert.equal(creator.data.description, 'Harmless QA edit by promoted Co-host.'); pass('Co-host edit works and original creator is preserved');
  assert.equal((await rpc(host, 'set_activity_cohost', { p_event_id: eventId, p_user_id: ids[1], p_cohost: false })).role, 'participant');
  const demoted = await participation(); assert.equal(demoted.status, 'approved');
  const denied = await member.rpc('update_activity', { p_event_id: eventId, p_patch: { description: 'This unauthorized edit must not persist.' } });
  assert(denied.error); pass('Demotion preserves participation and removes backend edit permission');
  const comment = await rpc(member, 'create_activity_comment', { p_event_id: eventId, p_body: '[QA] Eligible participant comment.', p_parent_id: null });
  assert(comment?.id); pass('Approved email-authenticated participant can comment');
  const room = await rpc(member, 'ensure_activity_chat', { p_event_id: eventId });
  assert(Number(room?.id ?? room) > 0); pass('Approved email-authenticated participant can open Activity Chat');
  console.log(JSON.stringify({ checks, target: new URL(url).hostname, eventId, chatRoomId: Number(room?.id ?? room), participants: ids, fixtureRetainedForUiVerification: true }));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', checksPassed: checks, eventId, message: error instanceof Error ? error.message : 'QA operation failed' }));
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map(client => client.auth.signOut({ scope: 'local' })));
}
