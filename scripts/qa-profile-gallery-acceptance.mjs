// TARGET-only reversible QA. Requires the existing member QA credentials in env.
// prepare leaves a clearly marked three-image gallery for production UI proof;
// cleanup removes only this script's QA objects and restores the initially empty gallery.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, 'cxsznhrkzqndhseodcyy.supabase.co');
const clients = [1, 2].map(() => createClient(url, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
const ok = async result => { const value = await result; assert.ifError(value.error); return value.data; };
const phase = process.env.QA_GALLERY_PHASE || 'prepare';
assert(['prepare', 'cleanup'].includes(phase));
const prefix = 'qa-acceptance-gallery-20261003';
try {
  const auth = [];
  for (let i = 0; i < clients.length; i++) {
    auth.push((await ok(clients[i].auth.signInWithPassword({ email: process.env[`QA_EMAIL_${i + 1}`], password: process.env[`QA_PASSWORD_${i + 1}`] }))).user);
    assert.equal(Number(await ok(clients[i].rpc('get_current_app_user_id'))), 70 + i);
  }
  const [owner, viewer] = clients;
  const list = () => ok(owner.from('tbl_user_profile_photos').select('id,position,storage_path,public_url').eq('user_id', 70).order('position'));
  const profile = () => ok(owner.from('tbl_users').select('profile_image').eq('id', 70).single());
  const paths = [1, 2, 3].map(n => `${auth[0].id}/profile-gallery/${prefix}-${n}.png`);
  const urls = paths.map(path => owner.storage.from('avatars').getPublicUrl(path).data.publicUrl);
  if (phase === 'prepare') {
    assert.equal((await profile()).profile_image, null, 'Refuse to replace any existing primary photo');
    assert.equal((await list()).length, 0, 'Refuse to replace any existing gallery');
    const sources = ['assets/brand/wenitro-mark-blue.png', 'assets/brand/wenitro-mark-white.png', 'assets/wenitro-logo-transparent.png'];
    for (let i = 0; i < paths.length; i++) {
      await ok(owner.storage.from('avatars').upload(paths[i], readFileSync(sources[i]), { contentType: 'image/png', upsert: false }));
      const response = await fetch(urls[i]); assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/png/);
    }
    await ok(owner.from('tbl_users').update({ profile_image: urls[0] }).eq('id', 70));
    for (const position of [2, 3]) await ok(owner.rpc('save_my_profile_photo', { p_position: position, p_storage_path: paths[position - 1], p_public_url: urls[position - 1] }));
    const fourth = await owner.rpc('save_my_profile_photo', { p_position: 4, p_storage_path: paths[2], p_public_url: urls[2] });
    assert(fourth.error); assert.match(fourth.error.message, /position|3/);
    const gallery = await list(); assert.equal(gallery.length, 2);
    const forbidden = await viewer.rpc('delete_my_profile_photo', { p_photo_id: gallery[0].id }); assert(forbidden.error); assert.match(forbidden.error.message, /not found/i);
    const publicGallery = await ok(viewer.from('tbl_user_profile_photos').select('position,public_url').eq('user_id', 70)); assert.equal(publicGallery.length, 2);
    await ok(owner.rpc('promote_my_profile_photo', { p_position: 2, p_previous_path: paths[0], p_previous_url: urls[0] }));
    assert.equal((await profile()).profile_image, urls[1]);
    assert.equal((await list()).find(p => p.position === 2).public_url, urls[0]);
    assert.equal((await list()).length, 2);
    console.log(JSON.stringify({ phase, user: 70, checks: ['three uploaded PNGs publicly render', 'primary plus two extras', 'fourth position rejected', 'other-user deletion rejected', 'public extra-gallery read', 'promote swaps primary without exceeding three'], readyForProductionUi: true, cleanupRequired: true }));
  } else {
    const current = await profile(); const gallery = await list();
    assert(urls.includes(current.profile_image) || current.profile_image === null, 'Unexpected primary: preserve it and stop');
    assert(gallery.every(photo => paths.includes(photo.storage_path)), 'Unexpected gallery data: preserve it and stop');
    for (const photo of gallery) await ok(owner.rpc('delete_my_profile_photo', { p_photo_id: photo.id }));
    if (current.profile_image) await ok(owner.rpc('delete_my_primary_profile_photo'));
    await ok(owner.storage.from('avatars').remove(paths));
    assert.equal((await profile()).profile_image, null); assert.equal((await list()).length, 0);
    console.log(JSON.stringify({ phase, user: 70, primaryRestored: null, galleryRestored: [], qaObjectsRemoved: 3 }));
  }
} finally {
  await Promise.all(clients.map(client => client.auth.signOut({ scope: 'local' })));
}
