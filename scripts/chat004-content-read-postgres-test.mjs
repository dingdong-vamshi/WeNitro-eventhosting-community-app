import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-chat004-read-'));let started=false,checks=0;
const run=(c,a,input)=>{const r=spawnSync(c,a,{input,encoding:'utf8'});if(r.error||r.status)throw Error(r.error?.message||r.stderr);return r.stdout.trim();};
const sql=q=>run('psql',['-h',dir,'-p','55475','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q);
const user=(q,admin=false,role='authenticated')=>sql(`set role ${role};select set_config('qa.admin','${admin}',false);${q}`).split('\n').at(-1);
const tables=['tbl_events','tbl_chat_rooms','tbl_activity_vibes','tbl_stories'];
try{
run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55475`,'-w','start']);started=true;
sql(`create role authenticated;create role anon;create schema private;create schema auth;create schema storage;
create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
create function public.is_wenitro_admin() returns boolean language sql stable as $$select coalesce(current_setting('qa.admin',true),'false')::boolean$$;
create function public.current_app_user_id() returns integer language sql as $$select 1$$;
create function public.get_current_app_user_id() returns integer language sql as $$select 1$$;
create function public.is_chat_member(bigint) returns boolean language sql as $$select true$$;
create function public.is_event_participant(bigint) returns boolean language sql as $$select true$$;
create function private.account_is_allowed() returns boolean language sql as $$select true$$;
create table public.tbl_users(id int,username text,fullname text,profile_image text);insert into public.tbl_users values(1,'qa','QA',null);
create table public.tbl_events(id int,admin_moderation_status text,status text,visibility_type text,media jsonb,created_by int,is_deleted boolean default false,is_cancelled boolean default false);
create table public.tbl_chat_rooms(id int,admin_moderation_status text,visibility text,created_by int,image_url text,cover_url text);
create table public.tbl_activity_vibes(id int,admin_moderation_status text,visibility text,user_id int,event_id int,media_url text);
create table public.tbl_stories(id bigint,admin_moderation_status text,user_id int,media_url text,deleted_at timestamptz,expires_at timestamptz,created_at timestamptz default now());
create table public.tbl_story_views(story_id bigint,viewer_id int);
create table public.tbl_messages(media_url text,room_id bigint);
create table public.tbl_user_verification(document_path text,user_id int);
create table public.tbl_community_posts(media_url text,room_id bigint,deleted_at timestamptz);
grant usage on schema public,private,auth to authenticated,anon;grant select on all tables in schema public to authenticated,anon;`);
for(const table of tables)sql(`alter table public.${table} enable row level security;create policy original_visibility on public.${table} for select to authenticated,anon using(true);`);
for(const [i,status] of ['active','hidden','removed'].entries()){const id=i+1;sql(`insert into public.tbl_events(id,admin_moderation_status,status,visibility_type,media,created_by) values(${id},'${status}','published','public','[{"url":"media${id}.png"}]',1);
insert into public.tbl_chat_rooms values(${id},'${status}','public',1,'media${id}.png',null);
insert into public.tbl_activity_vibes values(${id},'${status}','public',1,${id},'media${id}.png');
insert into public.tbl_stories(id,admin_moderation_status,user_id,media_url,expires_at) values(${id},'${status}',1,'media${id}.png',now()+interval '1 day');`);}
assert.equal(user('select count(*) from public.tbl_activity_vibes;'),'3');checks++;
sql(fs.readFileSync('supabase/migrations/20261012055118_chat004_content_read_enforcement.sql','utf8'));
for(const table of tables){assert.equal(user(`select count(*) from public.${table};`),'1');assert.equal(user(`select count(*) from public.${table};`,true),'3');assert.equal(user(`select count(*) from public.${table};`,false,'anon'),'1');checks+=3;}
for(const bucket of ['activity-media','communities','vibes','stories']){assert.equal(user(`select private.can_read_media('${bucket}','media1.png',null);`),'t');assert.equal(user(`select coalesce(private.can_read_media('${bucket}','media2.png',null),false);`),'f');assert.equal(user(`select coalesce(private.can_read_media('${bucket}','media2.png',null),false);`,true),'t');checks+=3;}
assert.equal(user('select count(*) from public.list_active_stories();'),'1');assert.equal(user('select count(*) from public.list_my_stories();'),'1');checks+=2;
for(const table of tables){sql(`update public.${table} set admin_moderation_status='active' where id=2;`);assert.equal(user(`select count(*) from public.${table};`),'2');checks++;}
console.log(JSON.stringify({status:'PASS',checks,scope:'Pre-fix direct read reproduced; restrictive RLS for all four types, anonymous isolation, Admin review access, private media denial, legacy Story RPC filtering and restore.'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
