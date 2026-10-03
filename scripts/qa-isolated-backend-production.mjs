// Production semantic QA. Default invocation is a side-effect-free plan.
// Synthetic financial fixtures are NOT evidence of a Cashfree provider payment.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';

export const target = 'cxsznhrkzqndhseodcyy';
export const requiredMigrations = ['20261003074100','20261003075132','20261003075305','20261003075444','20261003075804'];
export function validateRelease(release, url) {
  assert.equal(new URL(url).hostname, `${target}.supabase.co`, 'Wrong Supabase target');
  assert.equal(release.projectId, target);
  assert.equal(release.readyForProductionQA, true, 'Coordinator deployment readiness is required');
  for (const key of ['appDeploymentId','adminDeploymentId','cashfreeVerifyVersion']) assert(String(release[key] ?? '').trim(), `Missing ${key}`);
  for (const migration of requiredMigrations) assert(release.appliedMigrations?.includes(migration), `Missing migration ${migration}`);
}
export const plan = {
  target, requiredMigrations,
  checks: ['isolated account bans/inactive/deleted/deactivated with retained sessions', 'referral award/replay/self/cross-user history', 'atomic interests and archived catalog assignments', 'all22 achievement catalog, progress privacy and stable awards', 'owner/public Trust privacy and Nitro independence', 'private payment tiers, category capacity, late finalization/refund, Edge receipt and paid replay'],
  fixtures: 'Unique synthetic identities, private activities, temporary catalog rows. No existing identity is restricted.',
  financialScope: 'Service finalizer with explicitly synthetic provider references; no provider checkout, refund or payout calls. Retained ledger and settlement on hold.',
  execution: 'Requires --execute --release FILE --secrets-root DIR. Coordinator must explicitly publish deployed readiness first.',
};

async function main() {
  if (!process.argv.includes('--execute')) { console.log(JSON.stringify({status:'PLAN_ONLY',...plan},null,2)); return; }
  const arg = name => { const i=process.argv.indexOf(name); assert(i>=0 && process.argv[i+1] && !process.argv[i+1].startsWith('--'), `Missing ${name}`); return process.argv[i+1]; };
  const release=JSON.parse(fs.readFileSync(arg('--release'),'utf8'));
  const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
  validateRelease(release,url);
  const secretsRoot=path.resolve(arg('--secrets-root'));
  const {createClient}=await import('@supabase/supabase-js');
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const make=()=>createClient(url,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options);
  const service=createClient(url,fs.readFileSync(path.join(secretsRoot,'tmp/chat001-server-key'),'utf8').trim(),options);
  const cleanupFile=process.argv.includes('--cleanup-manifest')?path.resolve(arg('--cleanup-manifest')):null;
  const previous=cleanupFile?JSON.parse(fs.readFileSync(cleanupFile,'utf8')):null;
  if(previous){
    assert.equal(previous.target,target);assert.match(previous.runId,/^[a-z0-9]+-[a-f0-9]{6}$/);
    assert.equal(path.dirname(cleanupFile),path.join(secretsRoot,'tmp'));
    for(const u of previous.users){assert(u.email.startsWith(`qa.chat001.backend.${previous.runId}.`));assert(![70,71,116].includes(u.userId));}
  }
  const runId=previous?.runId??Date.now().toString(36)+'-'+randomBytes(3).toString('hex');
  const runDir=path.join(secretsRoot,'tmp'); fs.mkdirSync(runDir,{recursive:true});
  const manifestPath=cleanupFile??path.join(runDir,`chat001-backend-${runId}.json`);
  const manifest=previous??{runId,target,createdAt:new Date().toISOString(),users:[],events:[],categories:[]};
  const persist=()=>fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2),{mode:0o600}); persist();
  const proof={runId,target,release,startedAt:manifest.createdAt,source:'Deployed REST/RPC/Edge APIs with synthetic isolated fixtures',providerPaymentEvidence:false,checks:[],cleanup:[]};
  const clients=[];
  const ok=async p=>{const r=await p;if(r.error)throw Object.assign(new Error(r.error.message),{code:r.error.code});return r.data;};
  const rpc=(c,n,a={})=>ok(c.rpc(n,a));
  const pass=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);proof.checks.push({name,status:'PASS',actual});};
  const deny=async(name,p,pattern)=>{const r=await p;assert(r.error,name);if(pattern)assert.match(r.error.message,pattern,name);proof.checks.push({name,status:'PASS',code:r.error.code??null});};
  const row=data=>Array.isArray(data)?data[0]:data;
  const createUser=async(label,phone)=>{
    const email=`qa.chat001.backend.${runId}.${label}@example.com`,password=randomBytes(24).toString('base64url');
    const d=await ok(service.auth.admin.createUser({email,password,email_confirm:true,...(phone?{phone,phone_confirm:true}:{}),app_metadata:{qa_fixture:true},user_metadata:{full_name:`[QA] Backend ${label}`,qa_fixture:true}}));
    const fixture={label,email,password,id:d.user.id};manifest.users.push(fixture);persist();
    const client=make();clients.push(client);await ok(client.auth.signInWithPassword({email,password}));
    fixture.userId=await rpc(client,'get_current_app_user_id');persist();
    await ok(service.from('tbl_users').update({fullname:`[QA] Backend ${label}`,onboarding_completed:true}).eq('id',fixture.userId));
    return {...fixture,client};
  };
  const cleanup=async()=>{
    // Validate retained manifest ownership before retrying any interrupted cleanup.
    for(const u of manifest.users){const d=await ok(service.auth.admin.getUserById(u.id));assert.equal(d.user.email,u.email);assert.equal(d.user.app_metadata.qa_fixture,true);}
    if(manifest.events.length){const owned=await ok(service.from('tbl_events').select('id,title').in('id',manifest.events));assert.equal(owned.length,manifest.events.length);assert(owned.every(e=>e.title.startsWith(`[QA] ${runId} `)));}
    if(manifest.categories.length){const owned=await ok(service.from('tbl_categories').select('id,name').in('id',manifest.categories));assert.equal(owned.length,manifest.categories.length);assert(owned.every(c=>c.name.startsWith(`QA ${runId} `)));}
    const attempt=async(name,p)=>{try{await ok(p);proof.cleanup.push({name,status:'PASS'});}catch(e){proof.cleanup.push({name,status:'FAIL',code:e.code??null});}};
    if(manifest.events.length){
      await attempt('Private synthetic activities hidden',service.from('tbl_events').update({is_deleted:true}).in('id',manifest.events));
      await attempt('Synthetic paid ledger held',service.from('tbl_activity_payments').update({financial_status:'ON_HOLD'}).in('event_id',manifest.events).eq('status','paid'));
      await attempt('Synthetic settlements held',service.from('tbl_partner_settlements').update({status:'ON_HOLD',note:`Synthetic QA ${runId}; never pay out; no provider transaction exists.`}).in('event_id',manifest.events));
    }
    if(manifest.categories.length)await attempt('Synthetic categories archived',service.from('tbl_categories').update({is_enabled:false,archived_at:new Date().toISOString()}).in('id',manifest.categories));
    for(const u of manifest.users){
      await attempt(`Synthetic ${u.label} authority revoked and login banned`,service.auth.admin.updateUserById(u.id,{ban_duration:'876000h',app_metadata:{role:'',admin_status:'inactive',qa_fixture:true}}));
      await attempt(`Synthetic ${u.label} profile deactivated`,service.from('tbl_users').update({is_active:0}).eq('auth_user_id',u.id));
    }
    await Promise.allSettled(clients.map(c=>c.auth.signOut({scope:'local'})));
    manifest.cleanup=proof.cleanup;persist();
  };
  try {
    if(cleanupFile){proof.status='CLEANUP_ONLY';return;}
    // Reserved fictional US telephone range. Never send an SMS or represent this as real verification.
    const used=new Set();for(let page=1;;page++){const d=await ok(service.auth.admin.listUsers({page,perPage:1000}));for(const u of d.users)used.add((u.phone??'').replace(/^\+/,''));if(d.users.length<1000)break;}
    const phones=Array.from({length:100},(_,i)=>`120255501${String(i).padStart(2,'0')}`).filter(x=>!used.has(x)&&!used.has(x.slice(1)));assert(phones.length>=3);
    const host=await createUser('host',phones[0]),a=await createUser('buyer',phones[1]),b=await createUser('other',phones[2]),guard=await createUser('guard');
    const anon=make(); clients.push(anon);
    // Keep the same JWT throughout every transition; no sign-in or refresh hides stale-token bugs.
    for(const [label,patch] of [['inactive',{is_active:0}],['deleted',{is_delete:1}],['deactivated',{deactivated_at:new Date().toISOString()}]]){
      await ok(service.from('tbl_users').update(patch).eq('id',guard.userId));
      await deny(`${label} existing session cannot sync verification`,guard.client.rpc('sync_my_verification'),/Account unavailable|deactivated/);
      pass(`${label} existing session has no story data`,await rpc(guard.client,'list_active_stories'),[]);
      pass(`${label} existing session cannot read own profile through RLS`,await ok(guard.client.from('tbl_users').select('id').eq('id',guard.userId)),[]);
      await ok(service.from('tbl_users').update({is_active:1,is_delete:0,deactivated_at:null}).eq('id',guard.userId));
    }
    await ok(service.auth.admin.updateUserById(guard.id,{ban_duration:'24h'}));
    await deny('Banned identity retains no verification authority',guard.client.rpc('sync_my_verification'),/Account unavailable|deactivated/);
    await ok(service.auth.admin.updateUserById(guard.id,{ban_duration:'none'}));
    pass('Restored identity can resolve own profile',await rpc(guard.client,'get_current_app_user_id'),guard.userId);
    const before=await rpc(host.client,'list_my_nitro_history');
    pass('New confirmed referral grants exactly ten Nitro',(await rpc(a.client,'redeem_referral',{p_referrer_id:host.userId})).points,10);
    pass('Same referral replay awards nothing',(await rpc(a.client,'redeem_referral',{p_referrer_id:host.userId})).awarded,false);
    pass('Cross-inviter retry awards nothing',(await rpc(a.client,'redeem_referral',{p_referrer_id:b.userId})).awarded,false);
    await deny('Self referral rejected',host.client.rpc('redeem_referral',{p_referrer_id:host.userId}),/invalid/);
    const history=await rpc(host.client,'list_my_nitro_history');pass('Persisted Nitro increments once',history.balance-before.balance,10);
    pass('Referee cannot read inviter history',(await rpc(a.client,'list_my_nitro_history')).items.some(x=>x.description==='Successful referral'),false);
    // Private fixture categories only; no production category is edited.
    for(const label of ['kept','removed','new']){const c=await ok(service.from('tbl_categories').insert({name:`QA ${runId} ${label}`,icon:'Q',is_enabled:true}).select('id').single());manifest.categories.push(c.id);persist();}
    const [kept,removed,disabled]=manifest.categories;
    await rpc(a.client,'set_my_interests',{p_category_ids:[kept,removed]});await rpc(b.client,'set_my_interests',{p_category_ids:[removed]});
    await ok(service.from('tbl_categories').update({is_enabled:false,archived_at:new Date().toISOString()}).in('id',[kept,disabled]));
    await deny('New archived selection fails atomically',a.client.rpc('set_my_interests',{p_category_ids:[kept,disabled]}),/available category/);
    pass('Failed complete replacement preserves removed selections',(await ok(service.from('tbl_user_interests').select('category_id').eq('user_id',a.userId))).map(x=>x.category_id).sort((x,y)=>x-y),[kept,removed].sort((x,y)=>x-y));
    pass('Existing archived selection remains valid',(await rpc(a.client,'set_my_interests',{p_category_ids:[kept]})).map(x=>x.id),[kept]);
    pass('Other member interests unchanged',(await ok(service.from('tbl_user_interests').select('category_id').eq('user_id',b.userId))).map(x=>x.category_id),[removed]);
    await deny('Anonymous interest writes denied',anon.rpc('set_my_interests',{p_category_ids:[]}));
    const badges=await rpc(host.client,'profile_achievements',{p_user_id:host.userId});pass('All22 current achievements returned',badges.length,22);
    pass('All22 unique achievement slugs',new Set(badges.map(x=>x.slug)).size,22);
    const connector=badges.find(x=>x.slug==='first-connector');pass('Real referral earns connector badge',!!connector?.earned_at,true);
    const again=await rpc(host.client,'profile_achievements',{p_user_id:host.userId});pass('Reconciliation preserves earned timestamp',again.find(x=>x.slug==='first-connector').earned_at,connector.earned_at);
    const publicBadges=await rpc(b.client,'profile_achievements',{p_user_id:host.userId});pass('Public achievements hide private progress',publicBadges.every(x=>x.progress==null),true);
    await deny('Anonymous achievement reads denied',anon.rpc('profile_achievements',{p_user_id:host.userId}));
    const trust=await rpc(host.client,'my_trust_score'),publicTrust=await rpc(b.client,'profile_trust_score',{p_user_id:host.userId});
    pass('Public Trust total matches owner',publicTrust.total,trust.total);pass('Public Trust hides verification breakdown',Object.keys(publicTrust).sort(),['activities_joined','rating','total']);
    pass('Synthetic confirmed email and phone give twenty Trust independent of ten referral Nitro',trust.total,20);
    proof.catalog=badges;proof.trust={owner:trust,public:publicTrust};
    await ok(service.from('tbl_partner_profiles').upsert({user_id:host.userId,status:'APPROVED',business_name:`QA ${runId}`,decision_reason:'Synthetic API boundary fixture; not evidence of real Partner review'}));
    pass('Synthetic Partner capability enabled',(await rpc(host.client,'get_my_partner_profile')).can_host_paid,true);
    const activity=async(label)=>{
      const start=new Date(Date.now()+172800000),end=new Date(+start+3600000);
      const e=await ok(service.from('tbl_events').insert({created_by:host.userId,title:`[QA] ${runId} ${label}`,description:'Synthetic API fixture. No provider payment exists. Never refund or pay out.',visibility_type:'private',join_type:'direct',status:'published',event_start_time:start.toISOString(),event_end_time:end.toISOString(),registration_close_time:start.toISOString(),is_paid:true,price:0.01,currency:'INR',max_participants:5}).select('id').single());
      manifest.events.push(e.id);persist();
      const cats=await rpc(host.client,'save_activity_entry_categories',{p_event_id:e.id,p_categories:[{name:'Synthetic one-seat tier',price_paisa:1,capacity:1}]});
      await deny('Outsider cannot see private tier prices',b.client.rpc('list_activity_entry_categories',{p_event_id:e.id}),/unavailable/);
      await ok(service.from('tbl_event_participants').insert([{event_id:e.id,user_id:a.userId,status:'invited'},{event_id:e.id,user_id:b.userId,status:'invited'}]));
      return {id:e.id,category:cats[0].id};
    };
    const prepare=(who,e)=>rpc(who.client,'prepare_activity_payment',{p_event_id:e.id,p_entry_category_id:e.category}).then(row);
    const finalize=p=>rpc(service,'finalize_activity_payment',{p_order_id:p.provider_order_id,p_provider_payment_id:`SYNTHETIC_QA_${runId}_${p.id}`,p_amount_paisa:1,p_currency:'INR',p_provider_status:'SUCCESS',p_provider_metadata:{qa_fixture:true,qa_run:runId,provider_transaction_exists:false}}).then(row);
    const edge=async(who,p)=>ok(who.client.functions.invoke('cashfree-verify-payment',{body:{orderId:p.provider_order_id}}));
    const late=await activity('late-completed'),latePay=await prepare(a,late);
    // The real schedule trigger forbids backdating. Exercise completed lifecycle here; clock-expiry boundary is covered by real local PostgreSQL tests.
    await ok(service.from('tbl_events').update({status:'completed'}).eq('id',late.id));
    pass('Late paid finalizer returns final refund-required ledger',(await finalize(latePay)).financial_status,'REFUND_REQUIRED');
    const lateReceipt=await edge(a,latePay);pass('Deployed Edge reports money received without a seat',{paid:lateReceipt.paid,registrationConfirmed:lateReceipt.registrationConfirmed,refundRequired:lateReceipt.refundRequired},{paid:true,registrationConfirmed:false,refundRequired:true});
    pass('Paid refund replay stays unconfirmed',(await edge(a,latePay)).registrationConfirmed,false);
    const capacity=await activity('capacity');
    await deny('Unverified phone cannot prepare checkout',guard.client.rpc('prepare_activity_payment',{p_event_id:capacity.id,p_entry_category_id:capacity.category}),/verified phone/);
    await deny('Legacy checkout overload cannot skip selected category',a.client.rpc('prepare_activity_payment',{p_event_id:capacity.id}),/valid entry category/);
    const old=await prepare(a,capacity);
    await deny('Live category reservation prevents overbooking',b.client.rpc('prepare_activity_payment',{p_event_id:capacity.id,p_entry_category_id:capacity.category}),/category is full/);
    await ok(service.from('tbl_activity_payments').update({status:'expired',checkout_expires_at:new Date(Date.now()-60000).toISOString()}).eq('id',old.id));
    const fresh=await prepare(b,capacity);
    pass('Late provider success cannot displace current reservation',(await finalize(old)).financial_status,'REFUND_REQUIRED');
    await deny('Refund-required buyer cannot pay again',a.client.rpc('prepare_activity_payment',{p_event_id:capacity.id,p_entry_category_id:capacity.category}),/previous payment needs review/);
    pass('Refund-required payment does not occupy category seat',(await finalize(fresh)).financial_status,'PAYABLE');
    const accepted=await edge(b,fresh);pass('Deployed Edge confirms paid approved seat',accepted.registrationConfirmed,true);
    const rows=await ok(service.from('tbl_event_participants').select('user_id,status').eq('event_id',capacity.id));
    pass('Exactly one admitted participant persists',rows.filter(x=>['approved','going','paid'].includes(x.status)).map(x=>x.user_id),[b.userId]);
    await deny('Members cannot call service-only finalizer',a.client.rpc('finalize_activity_payment',{p_order_id:fresh.provider_order_id,p_provider_payment_id:'FORGED',p_amount_paisa:1,p_currency:'INR',p_provider_status:'SUCCESS'}));
    pass('Other member payment ledger remains private',await ok(a.client.from('tbl_activity_payments').select('id').eq('id',fresh.id)),[]);
    pass('Provider replay preserves same paid row',(await finalize(fresh)).id,fresh.id);
    const financial=await ok(service.from('tbl_partner_financial_events').select('payment_id,kind,status,amount_paisa').in('event_id',manifest.events));
    pass('Payment financial event remains idempotent',financial.filter(x=>x.payment_id===fresh.id&&x.kind==='PAYMENT').length,1);
    proof.financial={fixturesOnly:true,lateReceipt,accepted,participants:rows,events:financial};
    proof.status='PASS';
  } catch(e) {proof.status='FAIL';proof.failure={message:String(e.message).replace(/qa\.chat001[^\s]+@[^\s]+/g,'[synthetic identity]'),code:e.code??null};process.exitCode=1;}
  finally {
    try{await cleanup();}catch(e){proof.cleanup.push({name:'Manifest ownership verification',status:'FAIL',code:e.code??null});}if(proof.cleanup.some(x=>x.status==='FAIL')){proof.status='FAIL';process.exitCode=1;}
    proof.finishedAt=new Date().toISOString();proof.fixtureIds={users:manifest.users.map(u=>({label:u.label,id:u.userId})),events:manifest.events,categories:manifest.categories};
    fs.mkdirSync('docs',{recursive:true});const proofPath=`docs/chat001-isolated-backend-production-${runId}.json`;fs.writeFileSync(proofPath,JSON.stringify(proof,null,2)+'\n');
    console.log(JSON.stringify({status:proof.status,checks:proof.checks.length,cleanup:proof.cleanup,proofPath}));
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) await main();
