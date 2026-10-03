import fs from 'node:fs';
export async function runStorageChecks({host,a,service,ok,pass,deny,manifest,persist,runId,proof}){
 const bytes=fs.readFileSync('assets/brand/wenitro-mark-blue.png');
 for(const bucket of ['avatars','communities','vibes','messages']){
  const objectPath=`${host.id}/qa-ownership/${runId}.png`;manifest.objects.push({bucket,path:objectPath});persist();
  await ok(host.client.storage.from(bucket).upload(objectPath,bytes,{contentType:'image/png',upsert:false}));
  pass(`${bucket}: owner can read uploaded object`,(await ok(host.client.storage.from(bucket).download(objectPath))).size,bytes.length);
  await deny(`${bucket}: different user cannot overwrite`,a.client.storage.from(bucket).upload(objectPath,bytes,{contentType:'image/png',upsert:true}));
  const remove=await a.client.storage.from(bucket).remove([objectPath]);
  pass(`${bucket}: different user deletes no object`,!!remove.error||remove.data.length===0,true);
  pass(`${bucket}: owner object persists after unauthorized deletion`,(await ok(host.client.storage.from(bucket).download(objectPath))).size,bytes.length);
  const removed=await ok(host.client.storage.from(bucket).remove([objectPath]));
  pass(`${bucket}: owner deletion removes exactly this object`,removed.some(x=>x.name===objectPath),true);
  const listed=await ok(host.client.storage.from(bucket).list(`${host.id}/qa-ownership`,{search:`${runId}.png`}));
  pass(`${bucket}: deleted object absent from Storage listing`,listed.length,0);
 }
 for(const table of ['app_daily_activity','activity_daily_views','activity_daily_shares','admin_workspace_documents']){
  const read=await a.client.schema('private').from(table).select('*').limit(1);
  pass(`${table}: private schema not exposed through Data API`,read.error?.code,'PGRST106');
 }
 proof.storage={buckets:['avatars','communities','vibes','messages'],objectsRemoved:4,cacheNote:'Prior public avatar download can remain cached after deletion; authoritative removed-object response and Storage listing are checked instead of claiming immediate public CDN purge.',scope:'Actual owner upload/read/delete and cross-user overwrite/delete denial; private raw observation/workspace schema exposure denied. Authenticated content visibility is separately tested by community, activity and profile API suites.'};
}
