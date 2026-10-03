import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wn-auth-ip-'));let started=false,checks=0;
const run=(bin,args,input)=>{const r=spawnSync(bin,args,{input,encoding:'utf8',maxBuffer:3e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};
const sql=q=>run('psql',['-h',dir,'-p','55463','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q).trim();
const as=(id,q)=>sql(`set role authenticated;select set_config('qa.uid','${id===null?'':`00000000-0000-0000-0000-${String(id).padStart(12,'0')}`}',false);${q}`).split('\n').at(-1);
const read=(id,search='')=>JSON.parse(as(id,`select public.admin_auth_ip_observations('${search}');`));
const equal=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};const denied=fn=>{assert.throws(fn,/permission denied|Active Admin permission required/);checks++;};
try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55463`,'-w','start']);started=true;
 const roles=fs.readFileSync('supabase/migrations/20261003064250_admin_account_management.sql','utf8').split('create table private.admin_access_audit')[0];
 const account=fs.readFileSync('supabase/migrations/20261003075305_account_status_rpc_enforcement.sql','utf8').split('-- These SECURITY DEFINER')[0];
 sql(`create role anon;create role authenticated;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
 create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}',banned_until timestamptz);
 create table public.tbl_users(id int primary key,auth_user_id uuid,is_active int default1,is_delete int default0,deactivated_at timestamptz);
 create table auth.audit_log_entries(instance_id uuid,id uuid primary key,payload json,created_at timestamptz,ip_address varchar not null default '');
 ${roles}${account}
 insert into auth.users(id,raw_app_meta_data) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,case n when3 then '{"role":"admin"}' when4 then '{"role":"super_admin"}' when5 then '{"role":"finance_admin"}' else '{}' end::jsonb from generate_series(1,5)n;
 insert into public.tbl_users(id,auth_user_id) select n,('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,5)n;`.replaceAll('default1','default 1').replaceAll('default0','default 0').replaceAll('when3','when 3').replaceAll('when4','when 4').replaceAll('when5','when 5'));
 sql(fs.readFileSync('supabase/migrations/20261003203749_admin_auth_ip_observations.sql','utf8'));
 equal(read(3),{items:[],candidateCount:0,matchingCount:0,candidateLimit:500,resultLimit:100});
 for(const id of [1,2,5,null,99])denied(()=>read(id));
 denied(()=>sql('set role anon;select public.admin_auth_ip_observations();'));
 equal(sql("select has_table_privilege('authenticated','auth.audit_log_entries','SELECT');"),'f');
 equal(sql("select has_table_privilege('anon','auth.audit_log_entries','SELECT');"),'f');
 sql(`insert into auth.audit_log_entries(id,payload,created_at,ip_address) select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'{"action":"login","actor_id":"00000000-0000-0000-0000-000000000001","actor_username":"secret@example.invalid","access_token":"NEVER_RETURN"}',now()-n*interval'1 minute','192.0.2.1' from generate_series(1,501)n;
 insert into auth.audit_log_entries values(null,'ffffffff-0000-0000-0000-000000000001','{"action":"token_refreshed","actor_id":"00000000-0000-0000-0000-000000000002"}',now(),'2001:db8::1'),(null,'ffffffff-0000-0000-0000-000000000002','{"action":"bad payload content","actor_id":"not-a-uuid","email":"never@example.invalid"}',now()+interval'1 second','192.0.2.99'),(null,'ffffffff-0000-0000-0000-000000000003','{"action":"login"}',now()+interval'2 seconds','');`);
 const data=read(3);equal(data.items.length,100);equal(data.candidateCount,500);equal(data.matchingCount,500);equal(data.items[0].id,'ffffffff-0000-0000-0000-000000000002');equal(data.items[0].action,null);equal(data.items[0].actorUserId,null);equal(Object.keys(data.items[0]).sort(),['action','actorUserId','id','ipAddress','occurredAt'].sort());equal(JSON.stringify(data).includes('NEVER_RETURN'),false);equal(JSON.stringify(data).includes('@example.invalid'),false);
 equal(read(4).items.length,100);equal(read(3,'2001:DB8').items[0].actorUserId,2);equal(read(3,'token_refreshed').items.length,1);equal(read(3,'%').items.length,0);equal(read(3,'1').matchingCount,500);equal(read(3,'unmatched').items.length,0);assert.throws(()=>read(3,'x'.repeat(65)),/at most 64/);checks++;
 sql(`update auth.users set raw_app_meta_data='{"role":"admin","admin_status":"inactive"}' where id='00000000-0000-0000-0000-000000000003';`);denied(()=>read(3));
 sql(`update auth.users set raw_app_meta_data='{"role":"admin"}',banned_until=now()+interval'1 day' where id='00000000-0000-0000-0000-000000000003';`);denied(()=>read(3));
 sql(`update auth.users set banned_until=null where id='00000000-0000-0000-0000-000000000003';update public.tbl_users set is_active=0 where id=3;`);denied(()=>read(3));
 sql('update public.tbl_users set is_active=1,deactivated_at=now() where id=3;');denied(()=>read(3));
 sql('update public.tbl_users set deactivated_at=null,is_delete=1 where id=3;');denied(()=>read(3));
 sql("delete from auth.users where id='00000000-0000-0000-0000-000000000004';");denied(()=>read(4));equal(sql('select count(*) from auth.audit_log_entries;'),'504');
 console.log(JSON.stringify({status:'PASS',checks,scope:'Real PostgreSQL bounded current Admin/Master-only Auth IP reader; current Auth and account denials, zero broad table grants, raw-payload redaction, safe actor mapping, stable ordering, capped/literal search and honest empty result.'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
