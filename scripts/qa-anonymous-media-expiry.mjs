// Completes the previously minted authentic one-hour token test, then cleans only its named QA fixture.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createClient} from '@supabase/supabase-js';
const f=JSON.parse(fs.readFileSync('tmp/chat001-expiry.json','utf8'));assert.equal(f.post,36);assert.equal(f.room,244);assert(Date.now()>Date.parse(f.expiresAt),'Wait for the authentic expiry; never alter its token.');
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;assert.equal(new URL(url).hostname,'cxsznhrkzqndhseodcyy.supabase.co');assert.equal(new URL(f.link).origin,url);
const opts={auth:{persistSession:false,autoRefreshToken:false}},q=JSON.parse(fs.readFileSync('tmp/chat001-qa.json','utf8'));
const viewer=createClient(url,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,opts),server=createClient(url,fs.readFileSync('tmp/chat001-server-key','utf8').trim(),opts);
const ok=async p=>{const r=await p;assert.ifError(r.error);return r.data;};
try{
 const expired=await fetch(f.link,{method:'HEAD'});assert.equal(expired.status,403);
 await ok(viewer.auth.signInWithPassword({email:q.QA_EMAIL_2,password:q.QA_PASSWORD_2}));
 const post=await ok(server.from('tbl_community_posts').select('id,room_id,user_id,media_url,is_anonymous,deleted_at').eq('id',36).single());assert.equal(post.room_id,244);assert.equal(post.user_id,70);assert.equal(post.is_anonymous,true);assert.equal(post.deleted_at,null);assert(post.media_url.endsWith('/post/qa-anonymous-media-acceptance-20261003.png'));
 const media=await ok(viewer.functions.invoke('community-media',{body:{roomId:244,postIds:[36]}}));const fresh=media.urls['36'];assert.equal((await fetch(fresh,{method:'HEAD'})).status,200);
 await ok(server.from('tbl_community_posts').update({deleted_at:new Date().toISOString()}).eq('id',36).eq('room_id',244).eq('user_id',70));
 assert.equal((await fetch(fresh,{method:'HEAD'})).status,404);
 const remint=await ok(viewer.functions.invoke('community-media',{body:{roomId:244,postIds:[36]}}));assert.deepEqual(remint.urls,{});
 const page=await ok(viewer.rpc('community_list_posts',{p_room_id:244}));assert(!page.items.some(p=>p.id===36));
 await ok(server.storage.from('communities').remove([post.media_url.replace(/^media\/communities\//,'')]));
 const proof={checkedAt:new Date().toISOString(),target:new URL(url).hostname,post:36,room:244,mintedAt:f.mintedAt,expiresAt:f.expiresAt,initialStatus:f.initialStatus,authenticExpiredStatus:403,freshBeforeDeletion:200,afterSoftDeletion:404,remintOmitted:true,memberFeedOmitted:true,fixtureMediaRemoved:true,scope:'Original unmodified production token was allowed to expire naturally. Only preidentified QA post36 and its QA media were cleaned.'};
 fs.writeFileSync('docs/chat001-anonymous-media-expiry-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{await viewer.auth.signOut({scope:'local'});}
