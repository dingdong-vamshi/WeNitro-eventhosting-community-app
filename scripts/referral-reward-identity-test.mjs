import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-referral-identity-'));let started=false;
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',maxBuffer:4e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};
const sql=q=>run('psql',['-h',dir,'-p','55448','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q).trim();
try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55448`,'-w','start']);started=true;
 const badges=fs.readFileSync('supabase/migrations/20261002170748_client_badge_engine.sql','utf8');
 const identity=badges.slice(badges.indexOf('create function private.badge_referral_identity'),badges.indexOf('create function private.badge_metrics'));
 sql(`create role anon;create role authenticated;create schema auth;create schema private;grant usage on schema auth,private to authenticated;
 create function public.get_current_app_user_id() returns int language sql as $$select nullif(current_setting('qa.user',true),'')::int$$;
 create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz);
 create table public.tbl_users(id int primary key,auth_user_id uuid,points int default 0,is_active int default 1);
 create function private.badge_valid_user(int) returns bool language sql as $$select exists(select 1 from public.tbl_users where id=$1 and is_active=1)$$;
 create table public.tbl_referral_history(id serial primary key,referrer_id int,referred_user_id int unique,points_awarded int,created_at timestamptz default now());
 create table public.tbl_user_points_history(id int,user_id int,rating_id int,points_earned int,created_at timestamptz default now(),verification_method text);
 create table public.tbl_participant_ratings(id int,event_id int);create table public.tbl_events(id int,title text);
 insert into public.tbl_users(id,auth_user_id) select n,('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,10)n;
 insert into auth.users(id,email,email_confirmed_at) select auth_user_id,case id when 1 then 'inviter@gmail.com' when 2 then 'member@gmail.com' when 3 then 'm.e.m.b.e.r+alias@googlemail.com' when 4 then 'in.viter+self@googlemail.com' else 'member'||id||'@example.test' end,now() from public.tbl_users;
 ${identity}
 ${fs.readFileSync('supabase/migrations/20261003075444_referral_identity_reward_guard.sql','utf8')}`);
 let checks=0;const value=(u,q)=>sql(`set role authenticated;select set_config('qa.user','${u}',false);${q}`).split('\n').at(-1);const equal=(u,q,w)=>{assert.equal(value(u,q),w);checks++;};const deny=(u,q,re)=>{assert.throws(()=>value(u,q),re);checks++;};
 equal(2,"select public.redeem_referral(1)->>'points';",'10');equal(2,"select public.redeem_referral(1)->>'awarded';",'false');
 equal(3,"select public.redeem_referral(1)->>'awarded';",'false');equal(3,"select public.redeem_referral(5)->>'awarded';",'false');
 deny(1,'select public.redeem_referral(1);',/Referral is invalid/);deny(4,'select public.redeem_referral(1);',/own account/);
 sql("update auth.users set email_confirmed_at=null where id=(select auth_user_id from public.tbl_users where id=5);");deny(5,'select public.redeem_referral(1);',/Confirm your email or phone/);
 sql("update auth.users set phone='+919999999999',phone_confirmed_at=now() where id=(select auth_user_id from public.tbl_users where id=5);");equal(5,"select public.redeem_referral(1)->>'points';",'10');
 sql("update auth.users set phone='+919999999999',phone_confirmed_at=now() where id=(select auth_user_id from public.tbl_users where id=6);");equal(6,"select public.redeem_referral(1)->>'awarded';",'false');
 sql('update public.tbl_users set is_active=0 where id=1;');deny(7,'select public.redeem_referral(1);',/unavailable/);sql('update public.tbl_users set is_active=1 where id=1;');
 equal(7,"select public.redeem_referral(1)->>'points';",'10');
 equal(1,"select public.list_my_nitro_history()->>'balance';",'30');equal(1,"select jsonb_array_length(public.list_my_nitro_history()->'items');",'3');equal(1,"select public.list_my_nitro_history()->'items'->0->>'description';",'Successful referral');
 equal(2,"select jsonb_array_length(public.list_my_nitro_history()->'items');",'0');
 sql("insert into public.tbl_user_points_history(id,user_id,points_earned,verification_method) values(1,1,-5,'spend:Voucher');update public.tbl_users set points=points-5 where id=1;");
 equal(1,"select public.list_my_nitro_history()->>'balance';",'25');equal(1,"select jsonb_array_length(public.list_my_nitro_history()->'items');",'4');equal(1,"select count(distinct x->>'id') from jsonb_array_elements(public.list_my_nitro_history()->'items') x;",'4');
 assert.equal(sql('select count(*) from public.tbl_referral_history;'),'3');checks++;
 console.log(JSON.stringify({status:'PASS',checks,scope:'Ten-Nitro confirmed identity rewards; self/Gmail alias/phone duplicate abuse denied; repeat/cross-inviter idempotency; existing referral history and negative spend history; cross-user privacy'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
