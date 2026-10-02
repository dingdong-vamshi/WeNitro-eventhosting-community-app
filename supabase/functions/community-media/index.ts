import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.4';
import { createMediaHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const publicKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);

Deno.serve(createMediaHandler({
  secret: serviceKey,
  baseUrl: `${url}/functions/v1/community-media`,
  async authorizeRoom(authorization, roomId) {
    const client = createClient(url, publicKey, { ...options, global: { headers: { Authorization: authorization } } });
    const { data, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !data.user) return false;
    const membership = await client.rpc('assert_chat_membership', { p_room_id: roomId });
    return !membership.error && membership.data === true;
  },
  async posts(ids, roomId) {
    let query = admin.from('tbl_community_posts').select('id,room_id,media_url,is_anonymous,deleted_at')
      .in('id', ids).eq('is_anonymous', true).is('deleted_at', null);
    if (roomId !== undefined) query = query.eq('room_id', roomId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },
  async media(path, range) {
    const normalized = path.replace(/^media\/communities\//, '');
    if (/^https?:/i.test(normalized) || normalized.split('/').some(p => p === '..' || p === '.')) throw Error('Invalid stored path');
    const headers = new Headers({ Authorization: `Bearer ${serviceKey}`, apikey: serviceKey });
    if (range) headers.set('range', range);
    return fetch(`${url}/storage/v1/object/authenticated/communities/${normalized.split('/').map(encodeURIComponent).join('/')}`, { headers, redirect: 'error' });
  },
}));
