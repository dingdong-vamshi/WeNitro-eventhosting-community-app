// Disposable, explicitly gated public-preview proof. No existing media/account changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const target='cxsznhrkzqndhseodcyy';
export function validateRelease(release,url,deployment,version){
 assert.equal(new URL(url).hostname,`${target}.supabase.co`);assert.equal(release.projectId,target);assert.equal(release.readyForProductionQA,true);
 assert(deployment?.startsWith('dpl_'));assert.equal(release.appDeploymentId,deployment);
 assert(Number.isInteger(version)&&version>=4,'Hardened Edge version required');assert.equal(release.shareVibeVersion,version,'Coordinator must record actual deployed share-vibe version');
}
export function validateFixture(fixture,authId){
 assert.equal(fixture.ownerId,120);assert.equal(fixture.authId,authId);assert.match(fixture.runId,/^[a-f0-9-]{36}$/);
 assert.equal(fixture.mediaPath,`${authId}/qa-public-og/${fixture.runId}.png`);assert.equal(fixture.caption,`QA public preview example ${fixture.runId}`);
}
export async function verifyPublicPreview(request,id,caption){
 const checks=[];const check=(name,ok)=>{assert(ok,name);checks.push({name,status:'PASS'});};
 const publicResponse=await request(id);check('Disposable standalone public Vibe returns HTML 200',publicResponse.status===200);check('Public preview is not cached',publicResponse.headers.get('cache-control')==='no-store');
 const body=await publicResponse.text();check('Public caption present',body.includes(caption));check('Public canonical and deep link present',body.includes(`/share/vibe/${id}`)&&body.includes(`/#/vibe/${id}`));
 const image=body.match(/<meta property="og:image" content="([^"]+)"/);check('Public image metadata present',Boolean(image));
 const imageUrl=new URL(image[1].replaceAll('&amp;','&'));check('Owned image uses target signed Storage URL',imageUrl.hostname===`${target}.supabase.co`&&imageUrl.pathname.startsWith('/storage/v1/object/sign/vibes/'));
 // Return capability in memory only; caller checks it without saving or logging it.
 const privateResponse=await request(135);check('Existing private Activity Vibe remains 404',privateResponse.status===404);const denied=await privateResponse.text();check('Private response has no OG metadata or signed URL',!denied.includes('og:')&&!denied.includes('/storage/')&&!denied.includes('token='));
 return{checks,imageUrl:imageUrl.href,htmlSha256:createHash('sha256').update(body).digest('hex')};
}
async function main(){
 if(!process.argv.includes('--execute')){console.log(JSON.stringify({status:'PLAN_ONLY',target,scope:'Create one QA120-owned standalone public Vibe with synthetic one-pixel PNG/caption, verify anonymous OG/image and existing private135 denial, delete exact fixture and media in finally. Never change existing users, activities, permissions, or provider state.',requires:['coordinator Edge deployment signal','--release FILE with shareVibeVersion','--expected-deployment dpl_ID','--expected-edge-version N>=4','--secrets-root DIR','--output FILE']}));return;}
 const arg=name=>{const i=process.argv.indexOf(name);assert(i>=0&&process.argv[i+1]&&!process.argv[i+1].startsWith('--'),`Missing ${name}`);return process.argv[i+1];};
 const release=JSON.parse(fs.readFileSync(arg('--release'),'utf8'));const url=process.env.EXPO_PUBLIC_SUPABASE_URL;validateRelease(release,url,arg('--expected-deployment'),Number(arg('--expected-edge-version')));
 const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;assert(key);const secretRoot=arg('--secrets-root');const recipient=JSON.parse(fs.readFileSync(path.join(secretRoot,'tmp/chat001-admin-integrated-fixtures.json'),'utf8')).recipient;assert.equal(Number(recipient.userId),120);
 const{createClient}=await import('@supabase/supabase-js');const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const runId=randomUUID();const fixture={runId,ownerId:120,authId:recipient.authId,mediaPath:`${recipient.authId}/qa-public-og/${runId}.png`,caption:`QA public preview example ${runId}`};validateFixture(fixture,recipient.authId);
 const journal=path.join(secretRoot,'tmp',`chat001-public-og-${runId}.json`);fs.writeFileSync(journal,JSON.stringify(fixture,null,2));
 const proof={at:new Date().toISOString(),target,release:{appDeploymentId:release.appDeploymentId,adminDeploymentId:release.adminDeploymentId,shareVibeVersion:release.shareVibeVersion},status:'RUNNING',checks:[],cleanup:[],fixture:{ownerId:120,runId,mediaKind:'synthetic one-pixel PNG'},scope:'Synthetic public fixture only; no actual private media or real identity/provider data.'};
 const request=id=>fetch(`https://wenitro-app.vercel.app/share/vibe/${id}?qa=${runId}`,{signal:AbortSignal.timeout(20_000),cache:'no-store'});
 let authenticated=false;let baseline=null;
 const rewards=async()=>{
  const badges=await client.from('tbl_user_badges').select('badge_id,awarded_at').eq('user_id',120).order('badge_id');assert(!badges.error);
  const nitro=await client.rpc('list_my_nitro_history');assert(!nitro.error);
  const trust=await client.rpc('my_trust_score');assert(!trust.error);
  return{badges:badges.data,nitro:nitro.data,trust:trust.data};
 };
 try{
  const signed=await client.auth.signInWithPassword({email:recipient.email,password:recipient.password});assert(!signed.error&&signed.data.user?.id===recipient.authId,'QA authentication failed');authenticated=true;baseline=await rewards();
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNIC7kFAAK4AZWkHdrFAAAAAElFTkSuQmCC','base64');
  const upload=await client.storage.from('vibes').upload(fixture.mediaPath,png,{contentType:'image/png',upsert:false});assert(!upload.error,'Synthetic media upload failed');
  const created=await client.rpc('vibe_create',{p_event_id:null,p_media_path:fixture.mediaPath,p_media_type:'photo',p_caption:fixture.caption,p_hashtags:[],p_visibility:'public',p_show_in_vibes:true});assert(!created.error,'Synthetic public Vibe creation failed');
  const id=Number(created.data?.id);assert(Number.isSafeInteger(id)&&id>0);proof.fixture.vibeId=id;fs.writeFileSync(journal,JSON.stringify({...fixture,vibeId:id},null,2));
  assert.equal(created.data.user_id,120);assert.equal(created.data.event_id,null);assert.equal(created.data.visibility,'public');
  const verified=await verifyPublicPreview(request,id,fixture.caption);proof.checks.push(...verified.checks);proof.htmlSha256=verified.htmlSha256;
  const image=await fetch(verified.imageUrl,{signal:AbortSignal.timeout(20_000)});assert.equal(image.status,200);assert.match(image.headers.get('content-type')||'',/^image\/png/);const bytes=Buffer.from(await image.arrayBuffer());assert.deepEqual(bytes,png);proof.checks.push({name:'Public OG image capability returns exactly the synthetic owned PNG',status:'PASS',sha256:createHash('sha256').update(bytes).digest('hex')});proof.status='PASS';
 }catch{proof.status='FAIL';proof.reason='A scoped public-preview assertion failed; no raw response bodies or capabilities recorded.';process.exitCode=1;}
 finally{
  if(authenticated)try{
   validateFixture(fixture,recipient.authId);
   // Query exact unique ownership/path/caption even if create response was lost.
   const rows=await client.from('tbl_activity_vibes').select('id').eq('user_id',120).is('event_id',null).eq('media_url',fixture.mediaPath).eq('caption',fixture.caption);assert(!rows.error);assert((rows.data||[]).length<=1);
   for(const row of rows.data||[]){const removed=await client.rpc('vibe_delete',{p_vibe_id:row.id});assert(!removed.error);const response=await request(row.id);assert.equal(response.status,404);proof.cleanup.push({name:'Exact synthetic Vibe deleted and anonymous preview now 404',status:'PASS',vibeId:row.id});}
   const removed=await client.storage.from('vibes').remove([fixture.mediaPath]);assert(!removed.error);proof.cleanup.push({name:'Exact synthetic media removed',status:'PASS'});
   const listed=await client.storage.from('vibes').list(`${recipient.authId}/qa-public-og`,{search:`${runId}.png`});assert(!listed.error);assert(!(listed.data||[]).some(x=>x.name===`${runId}.png`));proof.cleanup.push({name:'Synthetic Storage object absence verified',status:'PASS'});
   if(baseline){assert.deepEqual(await rewards(),baseline);proof.cleanup.push({name:'QA120 badges, Nitro ledger and Trust unchanged',status:'PASS'});}
  }catch{proof.status='FAIL_CLEANUP';proof.reason='Cleanup assertion failed; recover only the exact ignored fixture journal, never broad-delete.';process.exitCode=1;}
  await client.auth.signOut({scope:'local'});client.realtime.disconnect();proof.finishedAt=new Date().toISOString();fs.writeFileSync(arg('--output'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:proof.status,checks:proof.checks.length,cleanup:proof.cleanup.length,output:arg('--output')}));
 }
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url))await main();
