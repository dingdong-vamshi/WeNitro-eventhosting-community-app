import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-account-status-'));let started=false;
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',maxBuffer:4e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};
const sql=q=>run('psql',['-h',dir,'-p','55447','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q).trim();
try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55447`,'-w','start']);started=true;
 sql(`create role anon;create role authenticated;create schema auth;create schema private;create schema storage;grant usage on schema auth,private,storage to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
 create table auth.users(id uuid primary key,banned_until timestamptz,email text,phone text,raw_user_meta_data jsonb,email_confirmed_at timestamptz,phone_confirmed_at timestamptz);
 create table public.tbl_users(id serial primary key,auth_user_id uuid,is_active int default 1,is_delete int default 0,deactivated_at timestamptz,fullname text,username text,profile_image text,dob date,gender text,onboarding_completed bool,email text,countrycode text,phonenumber bigint,phone_e164 text,password text,account_type text);
 create function public.current_app_user_id() returns int language sql as $$select id from public.tbl_users where auth_user_id=auth.uid()$$;
 create table public.tbl_stories(id bigint,user_id int,created_at timestamptz default now(),deleted_at timestamptz,expires_at timestamptz);create table public.tbl_story_views(story_id bigint,viewer_id int);
 create table public.tbl_user_privacy_settings(user_id int primary key);
 create table public.tbl_partner_profiles(user_id int primary key,status text);
 create function private.normalize_phone_e164(text) returns text language sql as $$select $1$$;
 create function private.sync_verification_rewards(uuid) returns jsonb language sql as $$select '{"test":"existing verification service"}'::jsonb$$;
 create table storage.objects(id int);insert into storage.objects values(1);alter table storage.objects enable row level security;grant select on storage.objects to authenticated;create policy allowed on storage.objects for select to authenticated using(true);
 create table public.qa_rls(id int);insert into public.qa_rls values(1);alter table public.qa_rls enable row level security;grant select on public.qa_rls to authenticated;create policy allowed on public.qa_rls for select to authenticated using(true);
 ${fs.readFileSync('scripts/fixtures/account-status-entrypoints.sql','utf8')}
 ${fs.readFileSync('supabase/migrations/20261003075305_account_status_rpc_enforcement.sql','utf8')}
 create policy account_guard on storage.objects as restrictive for select to authenticated using(private.account_is_allowed());
 create policy account_guard on public.qa_rls as restrictive for select to authenticated using(private.account_is_allowed());
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('00000000-0000-0000-0000-000000000003','qa@example.test',now(),'{}');
 insert into public.tbl_users(id,auth_user_id,username) values(3,'00000000-0000-0000-0000-000000000003','qa3');insert into public.tbl_stories(id,user_id,expires_at) values(1,3,now()+interval '1 day');`);
 let checks=0;const value=q=>sql("set role authenticated;select set_config('qa.uid','00000000-0000-0000-0000-000000000003',false);"+q).split('\n').at(-1);
 const equal=(q,w)=>{assert.equal(value(q),w);checks++;};
 const calls=["select private.bootstrap_my_profile();","select private.check_onboarding_username('newname');","select private.complete_my_onboarding(auth.uid(),'QA User','newname',null,null);","select public.submit_my_live_photo('anypath');","select public.sync_my_verification();"];
 equal('select private.account_is_allowed();','t');equal('select private.bootstrap_my_profile();','3');equal("select private.check_onboarding_username('newname');",'t');equal('select count(*) from storage.objects;','1');equal('select count(*) from public.list_active_stories();','1');
 for(const transition of ["update auth.users set banned_until=now()+interval '1 day';","update public.tbl_users set is_active=0;","update public.tbl_users set is_delete=1;","update public.tbl_users set deactivated_at=now();","delete from auth.users;"]){
  sql(transition);equal('select private.account_is_allowed();','f');equal('select count(*) from storage.objects;','0');equal('select count(*) from public.qa_rls;','0');equal('select count(*) from public.list_active_stories();','0');
  for(const q of calls){assert.throws(()=>value(q),/Account unavailable or deactivated/);checks++;}
  sql("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('00000000-0000-0000-0000-000000000003','qa@example.test',now(),'{}') on conflict(id) do update set banned_until=null;update public.tbl_users set is_active=1,is_delete=0,deactivated_at=null;");
 }
 sql("update auth.users set banned_until=now()-interval '1 second';");equal('select private.account_is_allowed();','t');equal('select private.bootstrap_my_profile();','3');
 // Bootstrap for a new confirmed identity remains available with no profile row.
 sql('delete from public.tbl_users;');equal('select private.account_is_allowed();','t');assert(Number(value('select private.bootstrap_my_profile();'))>0);checks++;
 console.log(JSON.stringify({status:'PASS',checks,scope:'Actual six RPC definitions: bans, inactive/deleted/deactivated profiles and deleted Auth identity rejected with an old JWT; direct table/Storage RLS denied; expired suspension and new-profile bootstrap work'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
