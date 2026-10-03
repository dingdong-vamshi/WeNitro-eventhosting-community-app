import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname,'cxsznhrkzqndhseodcyy.supabase.co');
const supabase=createClient(url,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const login=await supabase.auth.signInWithPassword({email:process.env.QA_EMAIL_2,password:process.env.QA_PASSWORD_2});assert.ifError(login.error);
try{
 const exports={};
 new Function('require','exports',ts.transpile(fs.readFileSync('src/services/activities-production.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}))(name=>{if(name==='../lib/supabase')return {supabase,isSupabaseConfigured:true};if(name==='./registration-questions')return {};throw Error('Unexpected import '+name);},exports);
 const service=exports.activitiesProductionService;
 const paid=await service.discover({minPriceInr:0.01,upcomingOnly:false,pageSize:100,sort:'newest'});
 const free=await service.discover({freeOnly:true,upcomingOnly:false,pageSize:100,sort:'newest'});
 assert(paid.items.some(a=>!a.isPaid&&a.costsMayApply),'Paid includes normal cost activities');
 assert(paid.items.some(a=>a.isPaid&&a.paymentCollectionMode==='cashfree'),'Paid includes Partner Cashfree activities');
 assert(paid.items.every(a=>a.isPaid||a.costsMayApply||a.entryFeeRequired));
 assert(free.items.length>0&&free.items.every(a=>!a.isPaid&&!a.costsMayApply&&!a.entryFeeRequired));
 assert.equal(paid.items.find(a=>a.ownerId==='71').owner.fullName,'Priya Nair');
 assert.equal(paid.items.find(a=>a.ownerId==='71').owner.isPartner,true);
 const evidence={at:new Date().toISOString(),target:new URL(url).hostname,scope:'Actual application discovery service against live target, read-only',paid:paid.items.map(a=>({id:a.id,platformPaid:a.isPaid,costsMayApply:a.costsMayApply,entryFeeRequired:a.entryFeeRequired,mode:a.paymentCollectionMode})),freeIds:free.items.map(a=>a.id),checks:['Normal off-platform cost activity retained in Paid','Partner Cashfree activity retained in Paid','Free excludes every cost flag','Full host name and Partner source identity present']};
 fs.writeFileSync('docs/chat001-activity-discovery-proof.json',JSON.stringify(evidence,null,2)+'\n');
 console.log('PASS: actual discovery service returns correct Paid/Free rows and host identity from live target.');
}finally{await supabase.auth.signOut({scope:'local'});}
