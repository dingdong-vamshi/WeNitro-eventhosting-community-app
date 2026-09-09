import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile = text => ts.transpile(text, {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
const module = {exports:{}};
const taxonomy = {exports:{}};
new Function('exports', compile(fs.readFileSync('src/domain/interest-categories.ts','utf8')))(taxonomy.exports);
new Function('exports', 'require', compile(fs.readFileSync('src/domain/host-activity.ts','utf8')))(module.exports, name => { assert.equal(name, './interest-categories'); return taxonomy.exports; });
const {newHostDraft,hostStepError,ageError,localDateTime,HOST_CATEGORIES,GENDER_OPTIONS}=module.exports;
const now=new Date('2026-09-08T12:00:00Z');
const valid={...newHostDraft(now),title:'A real meetup',description:'Meet to learn together',category:'Education',location:{label:'Pune, Maharashtra, India',latitude:18.52,longitude:73.85}};
for(const step of [0,1,2])assert.equal(hostStepError(valid,step,false,+now),'');
for(const title of ['', ' '.repeat(5), 'x'.repeat(51)])assert.ok(hostStepError({...valid,title},0,false,+now));
assert.ok(hostStepError({...valid,description:''},0,false,+now));
for(const capacity of ['0','-1','1.5','NaN','2147483648'])assert.ok(hostStepError({...valid,capacity},1,false,+now));
for(const capacity of ['','1','100'])assert.equal(hostStepError({...valid,capacity},1,false,+now),'');
assert.equal(ageError('20','45'),'');assert.ok(ageError('45','20'));assert.ok(ageError('-1','20'));assert.ok(ageError('20','121'));assert.equal(ageError('0',''),'');
assert.equal(HOST_CATEGORIES.length,21);assert.ok(!HOST_CATEGORIES.some(c => c.startsWith('[QA]')));assert.equal(GENDER_OPTIONS.length,4);
assert.ok(hostStepError({...valid,paid:true,price:'100'},1,false,+now));
for(const price of ['','0','-1','1.234','abc'])assert.ok(hostStepError({...valid,paid:true,price},1,true,+now));
assert.equal(hostStepError({...valid,paid:true,price:'100.50'},1,true,+now),'');
assert.ok(hostStepError({...valid,category:''},2,false,+now));assert.ok(hostStepError({...valid,location:null},2,false,+now));
assert.ok(hostStepError({...valid,end:localDateTime(now)},2,false,+now));
assert.ok(hostStepError({...valid,deadline:valid.end},2,false,+now));
assert.ok(hostStepError({...valid,start:localDateTime(now)},2,false,+now));
assert.equal(hostStepError({...valid,dateLater:true,start:'',end:'',deadline:''},2,false,+now),'');
assert.equal(new Date(localDateTime(now)).getTime(), +now);
// Execute the actual shared write function with mock transport; no network or uploads.
const source=fs.readFileSync('src/services/wenitro.ts','utf8');
const writeSource=source.slice(source.indexOf('const writeActivityFromUi ='),source.indexOf('export const activityService ='));
async function writeCase(failure){
  const calls=[];let receipt=null;
  const deps={currentLegacyUserId:async()=>44,validateRegistrationQuestions:()=>null,normalizeRegistrationQuestions:x=>x,
    uploadMedia:async()=>({path:'qa/cover.jpg'}),supabase:{rpc:async(name,args)=>{calls.push({name,args});return failure==='rpc'?{error:new Error('rejected')}:{data:123,error:null};},storage:{from:()=>({remove:async paths=>{calls.push({removed:paths});}})}},
    activityIdFromRpc:x=>String(x),activitiesProductionService:{getDetails:async()=>{if(failure==='reload')throw new Error('connection lost');return{activity:{joinType:'approval'},viewerState:{participation:null}};}},activityForWorkspace:async activity=>activity};
  const fn=new Function(...Object.keys(deps),compile(writeSource)+';return writeActivityFromUi;')(...Object.values(deps));
  const input={title:'QA',description:'QA',category:'Education',location:'Pune',startsAt:null,capacity:null,priceInr:0,visibility:'squad',joinType:'approval',verifiedOnly:true,ageMin:20,ageMax:45,genderPreference:'female',latitude:18.52,longitude:73.85,locationInstruction:'Entrance',coverMedia:{uri:'local'},onCommitted:async id=>{receipt=id;}};
  if(failure)await assert.rejects(fn(input,'published'));else await fn(input,'published');
  assert.equal(calls.filter(c=>c.name==='create_activity').length,1);
  const payload=calls[0].args.p_payload;assert.equal(payload.max_participants,null);assert.equal(payload.event_start_time,null);assert.equal(payload.verified_only,true);assert.equal(payload.age_max,45);assert.equal(payload.location_instruction,'Entrance');
  assert.equal(receipt,failure==='rpc'?null:'123');
  assert.equal(calls.some(c=>c.removed),failure==='rpc','Committed cover must survive detail-reload failure');
}
await writeCase();await writeCase('rpc');await writeCase('reload');
// Use the real location service with a controlled GPS/provider boundary.
const locationSource=compile(fs.readFileSync('src/services/activity-location.ts','utf8'));
async function locationCase(granted){
  const result={};const gps={requestForegroundPermissionsAsync:async()=>({granted}),Accuracy:{Balanced:3},getCurrentPositionAsync:async()=>({coords:{latitude:18.52,longitude:73.85}})};
  new Function('exports','require','fetch','process',locationSource)(result,()=>gps,async()=>({ok:true,json:async()=>({features:[{geometry:{coordinates:[73.85,18.52]},properties:{name:'A venue',city:'Pune'}}]})}),{env:{}});
  if(!granted)await assert.rejects(result.activityLocationService.current(),/denied/);
  else {assert.deepEqual(await result.activityLocationService.current(),{label:'A venue, Pune',latitude:18.52,longitude:73.85});assert.equal((await result.activityLocationService.search('Pune')).length,1);}
}
await locationCase(false);await locationCase(true);
console.log('PASS: host validation, nullable scheduling/capacity, field payloads, committed-save recovery, cover cleanup, and GPS permission/provider branches. No remote data written.');
