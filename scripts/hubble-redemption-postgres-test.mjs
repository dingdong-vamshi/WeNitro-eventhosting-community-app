import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-hubble-'));let started=false;let checks=0;
const args=['-h',dir,'-p','55471','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
const run=(cmd,argv,input)=>{const result=spawnSync(cmd,argv,{input,encoding:'utf8',maxBuffer:8e6});if(result.error||result.status)throw Error(result.error?.message||result.stderr||result.stdout);return result.stdout;};
const sql=query=>run('psql',args,query).trim();
const service=query=>sql(`select set_config('qa.role','service_role',false);${query}`).split('\n').at(-1);
const json=query=>JSON.parse(service(query));
const attempt=query=>service(`select qa_attempt($qa$${query}$qa$)`);
const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks+=1;};
const concurrent=query=>new Promise(resolve=>{const child=spawn('psql',args,{stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('close',status=>resolve({status,out,err}));child.stdin.end(`select set_config('qa.role','service_role',false);${query}`);});

try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);
 run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55471`,'-w','start']);started=true;
 sql(`
  create schema auth;create schema private;create schema vault;
  create role anon;create role authenticated;create role service_role;
  create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('qa.role',true),''),'anon')$$;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,phone text,phone_confirmed_at timestamptz);
  create table vault.decrypted_secrets(name text,decrypted_secret text);
  create table public.tbl_users(id int primary key,auth_user_id uuid,points int,fullname text,is_active int default 1,is_delete int default 0,deactivated_at timestamptz);
  create table public.tbl_participant_ratings(id int primary key,event_id int);
  create table public.tbl_events(id int primary key,title text);
  create table public.tbl_referral_history(id serial primary key,referrer_id int,points_awarded int,created_at timestamptz default now());
  create table public.tbl_user_points_history(id serial primary key,user_id int references public.tbl_users,rating_id int,points_earned int,verification_method text,created_at timestamptz default now());
  alter table public.tbl_user_points_history add constraint verification_reward_valid check(verification_method is null or verification_method in('email','phone','live_photo'));
  create unique index verification_reward_once on public.tbl_user_points_history(user_id,verification_method) where verification_method is not null;
  create table public.tbl_hubble_transactions(id serial primary key,user_id int references public.tbl_users,reference_id varchar not null unique,coins numeric not null,transaction_type varchar not null,status varchar not null,note text,created_at timestamptz default now());
  alter table public.tbl_hubble_transactions enable row level security;
  create function public.is_wenitro_admin() returns bool language sql as $$select false$$;
  create function public.get_current_app_user_id() returns int language sql as $$select nullif(current_setting('qa.user',true),'')::int$$;
  create function qa_attempt(q text) returns text language plpgsql as $$begin execute q;return 'ACCEPTED';exception when others then return sqlstate||':'||sqlerrm;end$$;
  insert into public.tbl_users(id,auth_user_id,points,fullname) select n,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,(array[199,200,201,250,250])[n],'User '||n from generate_series(1,5)n;
  insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) select auth_user_id,'u'||id||'@example.test',now(),'+91900000000'||id,now() from public.tbl_users;
  ${fs.readFileSync('supabase/migrations/20261006113000_hubble_nitro_redemption.sql','utf8')}
 `);

 eq(sql("select has_function_privilege('anon','public.hubble_debit(integer,numeric,text,text)','EXECUTE')"),'f');
 eq(sql("select has_function_privilege('authenticated','public.hubble_debit(integer,numeric,text,text)','EXECUTE')"),'f');
 eq(sql("select has_function_privilege('service_role','public.hubble_debit(integer,numeric,text,text)','EXECUTE')"),'t');
 eq(sql("select has_table_privilege('authenticated','public.tbl_hubble_transactions','INSERT')"),'f');
 eq(sql("select has_table_privilege('authenticated','public.tbl_hubble_transactions','SELECT')"),'t');
 eq(attempt("select public.hubble_debit(1,1,'below-200',null)"),'P0001:At least 200 Nitro Points are required to redeem');
 eq(json("select public.hubble_debit(2,1,'at-200','First redemption')").balance,199);
 const duplicate=json("select public.hubble_debit(2,1,'at-200','Changed retry note')");eq(duplicate.idempotent,true);eq(duplicate.balance,199);
 eq(sql("select count(*) from public.tbl_hubble_transactions where reference_id='at-200' and transaction_type='debit'"),'1');
 eq(json("select public.hubble_debit(3,201,'at-201','Full redemption')").balance,0);
 assert.match(attempt("select public.hubble_debit(4,251,'overspend',null)"),/Insufficient balance/);checks+=1;
 assert.match(attempt("select public.hubble_debit(3,201,'at-200',null)"),/conflicts with an existing debit/);checks+=1;
 const reversed=json("select public.hubble_reverse(2,'at-200','Provider cancellation')");eq(reversed.balance,200);eq(reversed.idempotent,false);
 const reverseAgain=json("select public.hubble_reverse(2,'at-200','Provider retry')");eq(reverseAgain.balance,200);eq(reverseAgain.idempotent,true);
 assert.match(attempt("select public.hubble_reverse(3,'at-200',null)"),/belongs to another user/);checks+=1;
 assert.match(attempt("select public.hubble_reverse(2,'missing',null)"),/Original debit not found/);checks+=1;
 eq(json('select public.hubble_get_balance(2)').totalCoins,200);
 eq(sql("select count(*) from public.tbl_user_points_history where user_id=2 and verification_method like 'spend:hubble:%'"),'1');
 eq(sql("select count(*) from public.tbl_user_points_history where user_id=2 and verification_method like 'refund:hubble:%'"),'1');
 eq(service("select set_config('qa.user','2',false);select public.list_my_nitro_history()->'items'->0->>'description'"),'Hubble redemption reversed · Provider cancellation');

 const races=await Promise.all([
  concurrent("select public.hubble_debit(5,200,'race-a','Concurrent A')"),
  concurrent("select public.hubble_debit(5,200,'race-b','Concurrent B')"),
 ]);
 eq(races.filter(result=>result.status===0).length,1);
 eq(races.filter(result=>result.status!==0).length,1);
 eq(sql('select points from public.tbl_users where id=5'),'50');
 eq(sql("select count(*) from public.tbl_hubble_transactions where user_id=5 and transaction_type='debit'"),'1');
 eq(sql("select count(*) from public.tbl_hubble_transactions where transaction_type='reverse' and original_transaction_id is not null"),'1');
 console.log(JSON.stringify({status:'PASS',checks,scope:'Hubble 199/200/201 eligibility, integer debits, balance/overspend, idempotent debit and reversal, wrong-user isolation, Nitro history, grants/RLS boundary, and concurrent overspend prevention'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
