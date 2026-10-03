import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'wn-admin-access-'));let started=false;
const run=(bin,args,input)=>{const r=spawnSync(bin,args,{input,encoding:'utf8',maxBuffer:4e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};
const sql=q=>run('psql',['-h',root,'-p','55444','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q);
try{run('initdb',['-D',root+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',root+'/db','-l',root+'/server.log','-o',`-F -h '' -k ${root} -p 55444`,'-w','start']);started=true;
sql(`create role anon;create role authenticated;create schema auth;create schema private;grant usage on schema auth,private to authenticated;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('qa.uid',true),'')::uuid $$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb,phone text,banned_until timestamptz,created_at timestamptz default now(),updated_at timestamptz,last_sign_in_at timestamptz);
create table auth.mfa_factors(user_id uuid,status text);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
('00000000-0000-0000-0000-000000000001','master@example.com',now(),'{"role":"super_admin"}'),
('00000000-0000-0000-0000-000000000002','admin@example.com',now(),'{"role":"admin"}'),
('00000000-0000-0000-0000-000000000003','member@example.com',now(),'{}'),
('00000000-0000-0000-0000-000000000004','unverified@example.com',null,'{}');`);
const migration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_admin_account_management.sql'));sql(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
let checks=0;const uid=n=>`set role authenticated;select set_config('qa.uid','00000000-0000-0000-0000-${String(n).padStart(12,'0')}',false);`;
const value=(n,q)=>sql(uid(n)+q).trim().split('\n').at(-1);const equal=(n,q,w)=>{assert.equal(value(n,q),w);checks++;};
const denied=(n,q,message)=>{assert.throws(()=>value(n,q),message);checks++;};
equal(1,'select jsonb_array_length(public.admin_accounts());','2');equal(2,'select jsonb_array_length(public.admin_accounts());','1');
denied(3,'select public.admin_accounts();',/permission required/);
denied(2,"select public.admin_set_account_access('member@example.com','super_admin','active','QA access');",/Master/);
denied(1,"select public.admin_set_account_access('master@example.com','admin','inactive','QA self revoke');",/own administrator/);
denied(1,"select public.admin_set_account_access('unverified@example.com','admin','active','QA access');",/verify its email/);
denied(1,"select public.admin_set_account_access('member@example.com','madeup','active','QA access');",/Invalid administrator/);
denied(1,"select public.admin_set_account_access('member@example.com','admin','active','');",/reason/);
equal(1,"select public.admin_set_account_access(' MEMBER@EXAMPLE.COM ','admin','active','QA provision')->>'changed';",'true');
equal(3,'select public.is_wenitro_admin();','t');
equal(1,"select public.admin_set_account_access('member@example.com','admin','active','QA duplicate')->>'changed';",'false');
equal(1,'select jsonb_array_length(public.admin_access_logs());','1');
equal(1,"select public.admin_set_account_access('member@example.com','admin','inactive','QA revoke')->>'changed';",'true');
equal(3,'select public.is_wenitro_admin();','f');denied(3,'select public.admin_accounts();',/permission required/);
equal(1,"select public.admin_set_account_access('member@example.com','finance_admin','active','QA finance')->>'changed';",'true');
equal(3,'select private.is_finance_admin();','t');equal(3,'select public.is_wenitro_admin();','f');
equal(1,"select public.admin_set_account_access('member@example.com','finance_admin','suspended','QA suspend')->>'changed';",'true');
equal(3,'select private.is_finance_admin();','f');denied(2,'select public.admin_access_logs();',/Master/);denied(1,'select * from private.admin_access_audit;',/permission denied/);
sql("update auth.users set banned_until=now()+interval '1 hour' where email='admin@example.com';");equal(2,'select public.is_wenitro_admin();','f');
console.log(JSON.stringify({status:'PASS',checks,scope:'Actual migration; Master/member/finance permissions; existing-session revocation; self lockout; unverified email; validation; idempotent audit; private log RLS'}));
}finally{if(started)run('pg_ctl',['-D',root+'/db','-m','immediate','-w','stop']);fs.rmSync(root,{recursive:true,force:true});}
