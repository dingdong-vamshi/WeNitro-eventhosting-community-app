import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-interest-atomic-'));let started=false;
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',maxBuffer:4e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};
const sql=q=>run('psql',['-h',dir,'-p','55449','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q).trim();
try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55449`,'-w','start']);started=true;
 const catalog=fs.readFileSync('supabase/migrations/20261003074100_admin_category_catalog.sql','utf8');const start=catalog.indexOf('create function private.require_enabled_category()');const guard=catalog.slice(start,catalog.indexOf('create trigger enabled_activity_category',start));
 sql(`create role anon;create role authenticated;create schema private;grant usage on schema private to authenticated;
 create function public.get_current_app_user_id() returns int language plpgsql as $$declare me int:=nullif(current_setting('qa.user',true),'')::int;begin if me is null then raise exception 'Authentication required' using errcode='42501';end if;return me;end$$;
 create table public.tbl_users(id int primary key);insert into public.tbl_users values(1),(2);
 create table public.tbl_categories(id int primary key,name text,icon text default '',is_enabled bool default true,archived_at timestamptz);
 create table public.tbl_user_interests(user_id int,category_id int references public.tbl_categories,created_at timestamptz default now(),unique(user_id,category_id));
 insert into public.tbl_categories(id,name,icon) values(1,'Existing','X'),(2,'Removed','R'),(3,'New active','A'),(4,'Archived','O'),(5,'New disabled','D');
 insert into public.tbl_user_interests(user_id,category_id) values(1,1),(1,2),(1,4),(2,2);
 update public.tbl_categories set archived_at=now() where id=4;update public.tbl_categories set is_enabled=false where id=5;
 ${guard}
 create trigger enabled_interest_category before insert or update of category_id on public.tbl_user_interests for each row execute function private.require_enabled_category();
 ${fs.readFileSync('supabase/migrations/20261003075804_atomic_profile_interests.sql','utf8')}`);
 let checks=0;const value=(u,q)=>sql(`set role authenticated;select set_config('qa.user','${u}',false);${q}`).split('\n').at(-1);const equal=(u,q,w)=>{assert.equal(value(u,q),w);checks++;};const deny=(u,q,re)=>{assert.throws(()=>value(u,q),re);checks++;};
 deny(1,'select public.set_my_interests(array[1,5]);',/Choose an available category/);
 assert.equal(sql('select string_agg(category_id::text,\',\' order by category_id) from public.tbl_user_interests where user_id=1;'),'1,2,4');checks++;
 equal(1,'select jsonb_array_length(public.set_my_interests(array[1,3,4,3]));','3');
 equal(1,"select x->>'icon' from jsonb_array_elements(public.set_my_interests(array[1,3,4])) x where x->>'id'='3';",'A');
 deny(2,'select public.set_my_interests(array[4]);',/Choose an available category/);
 assert.equal(sql('select category_id from public.tbl_user_interests where user_id=2;'),'2');checks++;
 deny(1,'select public.set_my_interests(array[999]);',/unavailable/);deny(1,'select public.set_my_interests(array[-1]);',/valid interests/);deny(1,'select public.set_my_interests(array[null]::integer[]);',/unavailable/);
 equal(1,'select jsonb_array_length(public.set_my_interests(array[]::integer[]));','0');
 assert.equal(sql('select count(*) from public.tbl_user_interests where user_id=1;'),'0');checks++;assert.equal(sql('select category_id from public.tbl_user_interests where user_id=2;'),'2');checks++;
 assert.throws(()=>sql('set role anon;select public.set_my_interests(array[1]);'),/permission denied/);checks++;
 console.log(JSON.stringify({status:'PASS',checks,scope:'Atomic interests replacement; failed stale category restores removals; archived selections retained; new archive/disabled denied; dedupe/validation/icons; authenticated ownership and clear-all'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
