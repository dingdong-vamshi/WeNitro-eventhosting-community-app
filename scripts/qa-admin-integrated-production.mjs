// Production acceptance uses dedicated synthetic identities and explicit recipients only.
// Requires the coordinator's deployment-ready signal. Never invoked by the local regression runner.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const mode=process.argv.find(v=>['--execute','--resume-workspaces','--observe-scheduled','--cleanup'].includes(v));
assert(mode,'Choose --execute, --resume-workspaces, --observe-scheduled, or --cleanup after deployment readiness.');
assert.equal(process.env.CHAT001_PRODUCTION_READY,'yes','Coordinator deployment readiness is required.');
assert(process.env.QA_APP_DEPLOYMENT_ID&&process.env.QA_ADMIN_DEPLOYMENT_ID,'Exact deployed App and Admin IDs are required.');
const sourceRoot=process.env.QA_SOURCE_ROOT||process.cwd();
const file=path.join(sourceRoot,'tmp/chat001-admin-integrated-fixtures.json');
const proofFile=path.join(sourceRoot,'docs/chat001-admin-integrated-production-proof.json');
const target='cxsznhrkzqndhseodcyy';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname,`${target}.supabase.co`);
const options={auth:{persistSession:false,autoRefreshToken:false}};
const make=()=>createClient(url,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options);
const service=createClient(url,fs.readFileSync(path.join(sourceRoot,'tmp/chat001-server-key'),'utf8').trim(),options);
const admin=make();const clients=[admin];
const qa=JSON.parse(fs.readFileSync(path.join(sourceRoot,'tmp/chat001-qa.json'),'utf8'));
const ok=async request=>{const r=await request;assert.ifError(r.error);return r.data;};
const rpc=(client,name,args={})=>ok(client.rpc(name,args));
const checks=[];
const pass=(name,condition,details)=>{assert(condition,name);checks.push({name,status:'PASS',...(details?{details}:{})});};
const denied=async(name,request,pattern=/administrator|permission|denied|unavailable|not configured/i)=>{const r=await request;pass(name,!!r.error&&pattern.test(r.error.message),{code:r.error?.code,httpStatus:r.status});};
let fixture=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
const saveFixture=()=>fs.writeFileSync(file,JSON.stringify(fixture,null,2)+'\n',{mode:0o600});
const saveProof=(status,error)=>{
 const previous=fs.existsSync(proofFile)?JSON.parse(fs.readFileSync(proofFile,'utf8')):{};
 const run={at:new Date().toISOString(),mode,status,checks,...(error?{error}: {})};
 fs.writeFileSync(proofFile,JSON.stringify({...previous,target,deployments:{app:process.env.QA_APP_DEPLOYMENT_ID,admin:process.env.QA_ADMIN_DEPLOYMENT_ID},scope:'Authenticated production API checks; screenshots and cron job inspection are separate evidence.',runs:[...(previous.runs||[]),run],fixtures:fixture?{categoryId:fixture.categoryId,eventId:fixture.eventId,hostId:fixture.host?.userId,recipientId:fixture.recipient?.userId,financeId:fixture.finance?.userId,documentIds:fixture.documents,scheduledCampaignId:fixture.scheduledCampaignId,scheduledAt:fixture.scheduledAt}:null},null,2)+'\n');
};
const listDocs=kind=>rpc(admin,'admin_workspace_list',{p_kind:kind});
const getDoc=async(kind,id)=>(await listDocs(kind)).find(d=>d.id===id);
const saveDoc=(row,payload=row.payload,archived=row.archived)=>rpc(admin,'admin_workspace_save',{p_id:row.id,p_kind:row.kind,p_payload:payload,p_version:row.version,p_archived:archived,p_reason:'CHAT001 dedicated production acceptance fixture'});
const createDoc=async(kind,name,channel='in_app',recipients=[])=>{
 const row=await saveDoc({id:randomUUID(),kind,version:0,archived:false,payload:{name,title:name,body:'Synthetic QA acceptance notification. No real event, transaction, or offer.',channel,recipients,status:'draft',notes:'QA proposal only; no monetary value or redemption.'}});
 fixture.documents.push({id:row.id,kind});saveFixture();return row;
};
const saveCategory=(enabled=true,archived=false,name=fixture.categoryName)=>rpc(admin,'admin_save_category',{p_id:fixture.categoryId??null,p_name:name,p_icon:'🧪',p_description:'Dedicated CHAT001 acceptance category; archived after evidence.',p_order:9999,p_enabled:enabled,p_archived:archived,p_reason:'CHAT001 dedicated category acceptance fixture'});
const notifications=client=>ok(client.from('tbl_notifications').select('id,is_read,data,title').eq('type','admin_campaign'));

try{
 const signedIn=await ok(admin.auth.signInWithPassword({email:qa.QA_EMAIL_ADMIN,password:qa.QA_PASSWORD_ADMIN}));
 if(mode==='--cleanup'){
  assert(fixture,'No fixture manifest');
  const cleanupErrors=[];const attempt=async(label,action)=>{try{await action();}catch(error){cleanupErrors.push(`${label}: ${error instanceof Error?error.message:String(error)}`);}};
  for(const ref of fixture.documents||[])await attempt(`archive ${ref.id}`,async()=>{const row=await getDoc(ref.kind,ref.id);if(row&&!row.archived)await saveDoc(row,row.payload,true);});
  if(fixture.eventId)await attempt('remove private Activity',()=>rpc(admin,'admin_moderate_activity',{p_event_id:fixture.eventId,p_action:'delete_event',p_reason:'CHAT001 dedicated fixture cleanup after acceptance'}));
  if(fixture.categoryId)await attempt('archive QA category',()=>saveCategory(false,true));
  for(const label of ['finance','recipient','host']){const person=fixture[label];if(!person)continue;await attempt(`revoke ${label} authority`,()=>ok(service.auth.admin.updateUserById(person.authId,{app_metadata:{role:'',admin_status:'inactive',qa_fixture:true}})));if(person.userId)await attempt(`deactivate ${label}`,()=>ok(service.from('tbl_users').update({is_active:0,deactivated_at:new Date().toISOString()}).eq('id',person.userId).eq('auth_user_id',person.authId)));}
  assert.equal(cleanupErrors.length,0,cleanupErrors.join('; '));
  fixture.cleanedAt=new Date().toISOString();saveFixture();pass('All dedicated campaigns archived and schedules cancelled; category archived; private unpaid Activity removed; synthetic identities deactivated and Finance authority revoked',true);saveProof('PASS');console.log(JSON.stringify({status:'PASS',mode,checks:checks.length}));
 }else{
  if(mode==='--execute'){
   assert(!fixture,'A fixture manifest already exists; inspect it before creating another run.');
   fixture={createdAt:new Date().toISOString(),adminAuthId:signedIn.user.id,documents:[],categoryName:`[QA] CHAT001 Category ${Date.now()}`};saveFixture();
   for(const [label,role] of [['host',''],['recipient',''],['finance','finance_admin']]){
    const email=`qa.chat001.integrated.${label}.${Date.now()}@example.com`,password=randomBytes(24).toString('base64url');
    const created=await ok(service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{role,admin_status:'active',qa_fixture:true},user_metadata:{full_name:`QA Audit ${label}`,qa_fixture:true}}));
    fixture[label]={email,password,authId:created.user.id};saveFixture();
    const client=make();clients.push(client);await ok(client.auth.signInWithPassword({email,password}));
    const userId=Number(await rpc(client,'get_current_app_user_id'));assert(userId>0);fixture[label].userId=userId;saveFixture();
    await ok(service.from('tbl_users').update({fullname:`QA Audit ${label}`,onboarding_completed:true}).eq('id',userId).eq('auth_user_id',created.user.id));
   }
  }
  assert(fixture&&!fixture.cleanedAt,'Active fixture manifest required.');
  const host=make(),recipient=make(),finance=make();clients.push(host,recipient,finance);
  for(const [client,label] of [[host,'host'],[recipient,'recipient'],[finance,'finance']])await ok(client.auth.signInWithPassword({email:fixture[label].email,password:fixture[label].password}));
  if(mode==='--observe-scheduled'){
   assert(fixture.scheduledCampaignId,'No scheduled QA campaign');
   const row=await getDoc('campaign',fixture.scheduledCampaignId);
   pass('Actual cron dispatch marked the scheduled campaign sent',row?.status==='sent',{scheduledAt:fixture.scheduledAt,sentAt:row?.sent_at,lastError:row?.last_error});
   const delivered=(await notifications(recipient)).filter(n=>n.data?.campaign_id===row.id);
   pass('Actual scheduled message reached only the dedicated recipient once',delivered.length===1&&row.delivered===1,{delivered:row.delivered});
   await rpc(admin,'admin_send_campaign',{p_id:row.id,p_version:row.version,p_reason:'CHAT001 scheduled delivery replay acceptance'});
   pass('Post-cron delivery replay does not duplicate the notification',(await notifications(recipient)).filter(n=>n.data?.campaign_id===row.id).length===1);
   saveProof('PASS');console.log(JSON.stringify({status:'PASS',mode,checks:checks.length,scheduledCampaignId:row.id}));
  }else{
   if(mode==='--execute'){
   const categoryArgs={p_id:null,p_name:'[QA] unauthorized category',p_icon:'',p_description:'',p_order:9999,p_enabled:true,p_archived:false,p_reason:'CHAT001 unauthorized mutation denial'};
   for(const [client,label] of [[host,'Member'],[finance,'Finance']]){
    await denied(`${label} cannot manage categories`,client.rpc('admin_save_category',categoryArgs));
    await denied(`${label} cannot read workspace documents`,client.rpc('admin_workspace_list',{p_kind:'campaign'}));
    await denied(`${label} cannot read usage analytics`,client.rpc('admin_usage_metrics',{p_days:30}));
    await denied(`${label} cannot manage creation gates`,client.rpc('admin_feature_gates',{}));
   }
   const category=await saveCategory();fixture.categoryId=category.id;saveFixture();
   pass('Admin category creation persists',(await ok(host.from('tbl_categories').select('id,name,icon').eq('id',category.id).single())).name===fixture.categoryName);
   const start=new Date(Date.now()+3*864e5),end=new Date(start.getTime()+36e5);
   fixture.eventPayload={title:'[QA] CHAT001 Integrated Admin acceptance',description:'Private unpaid synthetic acceptance fixture. No real event or money.',category:fixture.categoryName,event_start_time:start.toISOString(),event_end_time:end.toISOString(),registration_close_time:start.toISOString(),max_participants:null,visibility_type:'private',join_type:'approval',location:'QA acceptance venue',is_paid:false,price_inr:0,payment_collection_mode:'none'};
   const event=await rpc(host,'create_activity',{p_payload:fixture.eventPayload,p_status:'published'});fixture.eventId=Number(event.id??event);saveFixture();
   await saveCategory(false);await rpc(host,'update_activity',{p_event_id:fixture.eventId,p_patch:{title:'[QA] CHAT001 Historical category edit',category:fixture.categoryName}});
   pass('Disabled category stays attached through unrelated historical Activity edit',(await ok(admin.from('tbl_event_categories').select('category_id').eq('event_id',fixture.eventId))).some(r=>r.category_id===fixture.categoryId));
   await denied('Disabled category cannot be assigned to a new Activity',host.rpc('create_activity',{p_payload:{...fixture.eventPayload,title:'[QA] Must reject disabled category'},p_status:'published'}),/available category/i);
   await saveCategory(true,true);await rpc(host,'update_activity',{p_event_id:fixture.eventId,p_patch:{description:'Historical archived category preserved during ordinary edit.',category:fixture.categoryName}});
   pass('Archived category state persists while the historical Activity reference survives',!!(await ok(admin.from('tbl_categories').select('archived_at').eq('id',fixture.categoryId).single())).archived_at&&(await ok(admin.from('tbl_event_categories').select('category_id').eq('event_id',fixture.eventId))).some(r=>r.category_id===fixture.categoryId));
   pass('QA catalog fixtures are not offered by the selectable legacy catalog',!(await rpc(host,'list_interest_catalog')).some(c=>c.id===fixture.categoryId));
   fixture.categoryName+=' restored';await saveCategory(true,false);saveFixture();
   pass('Category restore and rename preserve the same historical category ID',(await ok(admin.from('tbl_categories').select('name,archived_at,is_enabled').eq('id',fixture.categoryId).single())).name===fixture.categoryName);
   await rpc(host,'record_app_usage',{p_platform:'web',p_event_id:fixture.eventId});await rpc(host,'record_app_usage',{p_platform:'web',p_event_id:fixture.eventId});
   await rpc(host,'record_activity_share',{p_event_id:fixture.eventId});await rpc(host,'record_activity_share',{p_event_id:fixture.eventId});
   await denied('A nonmember cannot observe/share the private QA Activity',recipient.rpc('record_app_usage',{p_platform:'web',p_event_id:fixture.eventId}));
   await denied('Private QA Activity share visibility is enforced',recipient.rpc('record_activity_share',{p_event_id:fixture.eventId}));
   const metrics=await rpc(admin,'admin_usage_metrics',{p_days:30});const today=new Date().toISOString().slice(0,10);
   pass('Usage reports the explicit UTC observation window',metrics.timezone==='UTC'&&metrics.since&&metrics.dau>=1&&metrics.mau>=metrics.dau,{timezone:metrics.timezone,since:metrics.since,dau:metrics.dau,mau:metrics.mau,retention:metrics.retention});
   pass('Repeated QA Activity views persist once per member and UTC day',metrics.views.filter(v=>v.event_id===fixture.eventId&&v.day===today).reduce((n,v)=>n+Number(v.views),0)===1);
   pass('Repeated Activity shares persist once independently of views',metrics.shares.filter(v=>v.event_id===fixture.eventId&&v.day===today).reduce((n,v)=>n+Number(v.shares),0)===1);
   const gates=await rpc(admin,'admin_feature_gates');pass('All four deployed creation gates are readable without changing global state',gates.length===4&&gates.every(g=>g.enabled===true));
   }
   for(const kind of ['notification_template','email_template','reward','coupon']){
    const existing=fixture.documents.find(d=>d.kind===kind);
    let row=existing?await getDoc(kind,existing.id):await createDoc(kind,`[QA] CHAT001 ${kind}`,kind==='email_template'?'email':'in_app');
    pass(`${kind} draft survives a fresh database read`,(await getDoc(kind,row.id))?.version>=1);
    const stale={...row};row=await saveDoc(row,{...row.payload,notes:`Persisted QA edit ${Date.now()}`});
    await denied(`${kind} stale editor cannot overwrite a newer version`,admin.rpc('admin_workspace_save',{p_id:stale.id,p_kind:kind,p_payload:{...stale.payload,notes:'stale'},p_version:stale.version,p_archived:false,p_reason:'CHAT001 stale save denial'}),/changed|reload/i);
    row=await saveDoc(row,row.payload,true);pass(`${kind} archive persists`,(await getDoc(kind,row.id)).archived===true);await saveDoc(row,row.payload,false);
   }
   for(const channel of ['email','push']){
    const row=await createDoc('campaign',`[QA] CHAT001 ${channel} provider draft`,channel,[fixture.recipient.userId]);
    await denied(`${channel} provider cannot claim a false send`,admin.rpc('admin_send_campaign',{p_id:row.id,p_version:row.version,p_reason:'CHAT001 unconfigured provider acceptance'}),/provider is not configured/i);
    pass(`${channel} provider failure preserves the saved draft`,(await getDoc('campaign',row.id)).status==='draft');
   }
   let direct=await createDoc('campaign','[QA] CHAT001 Immediate in-app acceptance','in_app',[fixture.recipient.userId]);
   direct=await rpc(admin,'admin_send_campaign',{p_id:direct.id,p_version:direct.version,p_reason:'CHAT001 dedicated recipient delivery acceptance'});
   await rpc(admin,'admin_send_campaign',{p_id:direct.id,p_version:direct.version,p_reason:'CHAT001 one-shot delivery replay acceptance'});
   const actual=(await notifications(recipient)).filter(n=>n.data?.campaign_id===direct.id);
   pass('Immediate in-app campaign delivered exactly once to the dedicated recipient',actual.length===1);
   pass('Unaddressed synthetic host cannot see the delivered message',!(await notifications(host)).some(n=>n.data?.campaign_id===direct.id));
   await rpc(recipient,'mark_notification_read',{p_notification_id:actual[0].id});const read=await getDoc('campaign',direct.id);
   pass('Campaign delivery/read totals reflect stored member receipt',read.delivered===1&&read.opened===1);
   let cancelled=await createDoc('campaign','[QA] CHAT001 Cancelled schedule','in_app',[fixture.recipient.userId]);
   cancelled=await rpc(admin,'admin_schedule_campaign',{p_id:cancelled.id,p_version:cancelled.version,p_when:new Date(Date.now()+36e5).toISOString(),p_reason:'CHAT001 future schedule cancellation test'});
   cancelled=await rpc(admin,'admin_schedule_campaign',{p_id:cancelled.id,p_version:cancelled.version,p_when:null,p_reason:'CHAT001 cancel before scheduled delivery'});
   pass('Cancellation clears a pending schedule while preserving the draft',cancelled.status==='draft'&&cancelled.scheduled_at===null);
   let scheduled=await createDoc('campaign','[QA] CHAT001 Actual cron delivery','in_app',[fixture.recipient.userId]);fixture.scheduledAt=new Date(Date.now()+120e3).toISOString();
   scheduled=await rpc(admin,'admin_schedule_campaign',{p_id:scheduled.id,p_version:scheduled.version,p_when:fixture.scheduledAt,p_reason:'CHAT001 actual cron delivery to dedicated QA recipient'});fixture.scheduledCampaignId=scheduled.id;saveFixture();
   pass('Future schedule persists; delivery is not yet claimed',scheduled.status==='draft'&&scheduled.scheduled_at!==null);
   saveProof('PASS');console.log(JSON.stringify({status:'PASS',mode,checks:checks.length,eventId:fixture.eventId,categoryId:fixture.categoryId,hostId:fixture.host.userId,recipientId:fixture.recipient.userId,scheduledCampaignId:fixture.scheduledCampaignId,scheduledAt:fixture.scheduledAt,remaining:'Run --observe-scheduled after due time and inspect the actual cron job; retain fixtures for deployed UI proof, then --cleanup.'}));
  }
 }
}catch(error){saveProof('FAIL',error instanceof Error?error.message:String(error));throw error;}
finally{await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));}
