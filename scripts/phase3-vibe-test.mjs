import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('src/services/wenitro.ts','utf8');
const code=ts.transpile(source.slice(source.indexOf('export const vibeService ='),source.indexOf('export const communityService =')),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
for (const mode of ['success','sign-error','sign-throw','rpc-error']) {
  let creates=0,discoveries=0; const api={};
  const production={create:async()=>{creates++;if(mode==='rpc-error')throw new Error('rejected');return{id:99,media_url:'owner/upload.jpg'}},listReels:()=>{discoveries++;throw new Error('Must not reload an unrelated feed')}};
  const backend = { storage: { from: bucket => {
    assert.equal(bucket, 'vibes');
    return { createSignedUrl: async path => {
      assert.equal(path, 'owner/upload.jpg');
      if (mode === 'sign-throw') throw new Error('offline');
      return mode === 'sign-error' ? { error: new Error('offline') } : { data: { signedUrl: 'https://example.test/signed' } };
    } };
  } } };
  new Function('exports','vibesProductionService','supabase','activitiesProductionService','activityForWorkspace',code)(api,production,backend,{listVibeEligible:async(cursor,signal)=>{assert.equal(cursor,'51');assert.ok(signal);return{items:[{id:'50'}],nextCursor:'1'}}},async x=>x);
  const input={caption:'A legitimate highlight',mediaUri:'blob:own-upload',activityId:'1'};
  if(mode==='rpc-error')await assert.rejects(api.vibeService.create(input),/rejected/);
  else {const result=await api.vibeService.create(input);assert.equal(result.id,'99');assert.equal(result.media_url,mode==='success'?'https://example.test/signed':'blob:own-upload');}
  assert.equal(creates,1);assert.equal(discoveries,0);
  const page=await api.vibeService.listEligibleActivities('51',new AbortController().signal);assert.deepEqual(page,{items:[{id:'50'}],nextCursor:'1'});
}
console.log('PASS: committed Vibe ID stays correct through signing failures; no extra feed scan/publication; eligibility cursor and cancellation forwarded. No remote requests.');
