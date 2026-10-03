import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wenitro-media-choice-'));let started=false,checks=0;
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',maxBuffer:4e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};const sql=q=>run('psql',['-h',dir,'-p','55457','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q).trim();
const eq=(a,b)=>{assert.equal(a,b);checks++;};const as=(u,q)=>sql(`set role authenticated;select set_config('qa.user','${u}',false);${q}`).split('\n').at(-1);
const create=(u,event,visible,feed,legacy=false)=>as(u,`select public.vibe_create(${event??'null'},'own/media.jpg','image','QA media','{}','${visible}'${legacy?'':`,${feed}`})->>'id';`);
try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55457`,'-w','start']);started=true;
 sql(`create role anon;create role authenticated;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql as $$select ('00000000-0000-0000-0000-'||lpad(current_setting('qa.user'),12,'0'))::uuid$$;
 create function auth.role() returns text language sql as $$select current_user::text$$;
 create function public.current_app_user_id() returns int language sql as $$select current_setting('qa.user')::int$$;
 create function public.get_current_app_user_id() returns int language sql as $$select public.current_app_user_id()$$;
 create function public.is_wenitro_admin() returns bool language sql as $$select false$$;
 create table public.tbl_events(id int primary key,created_by int,status text default 'published',is_deleted bool default false,is_cancelled bool default false);
 create table public.tbl_event_participants(event_id int,user_id int,status text);
 create function public.is_event_participant(int) returns bool language sql as $$select exists(select 1 from public.tbl_event_participants where event_id=$1 and user_id=public.current_app_user_id() and status in ('approved','going','paid'))$$;
 create table public.tbl_activity_vibes(id bigint generated always as identity,event_id bigint,user_id int,media_url text,media_type text,caption text,hashtags text[],visibility text,created_at timestamptz default now());
 alter table public.tbl_activity_vibes enable row level security;
 create policy own_vibes_write on public.tbl_activity_vibes for all to authenticated using(user_id=public.current_app_user_id()) with check(user_id=public.current_app_user_id());
 create policy vibes_read on public.tbl_activity_vibes for select to authenticated using(visibility='public' or user_id=public.current_app_user_id() or public.is_wenitro_admin() or (visibility='activity' and exists(select 1 from public.tbl_events e where e.id=event_id and (e.created_by=public.current_app_user_id() or public.is_event_participant(e.id)))));
 insert into public.tbl_events(id,created_by) values(1,1),(2,1);
 insert into public.tbl_event_participants values(1,2,'approved'),(1,3,'approved'),(1,4,'pending');
 insert into public.tbl_activity_vibes(event_id,user_id,media_url,media_type,caption,visibility) values(1,2,'legacy/media.jpg','photo','Legacy associated','public');
 ${fs.readFileSync('supabase/migrations/20260908095617_phase3_vibe_activity_eligibility.sql','utf8')}
 ${fs.readFileSync('supabase/migrations/20261003185740_activity_media_feed_choice.sql','utf8')}
 grant usage on schema public,private,auth to authenticated;grant select,insert,update,delete on public.tbl_activity_vibes to authenticated;grant select on public.tbl_events,public.tbl_event_participants to authenticated;grant usage on all sequences in schema public to authenticated;
 `);
 eq(sql('select visibility from public.tbl_activity_vibes where id=1'),'activity');eq(sql('select show_in_vibes from public.tbl_activity_vibes where id=1'),'t');
 const hidden=create(2,1,'activity',false),shown=create(2,1,'activity',true),forged=create(2,1,'public',true),old=create(2,1,'public',true,true),standalone=create(2,null,'public',false);
 eq(sql(`select show_in_vibes from public.tbl_activity_vibes where id=${hidden}`),'f');eq(sql(`select show_in_vibes from public.tbl_activity_vibes where id=${shown}`),'t');
 eq(sql(`select visibility from public.tbl_activity_vibes where id=${forged}`),'activity');eq(sql(`select visibility||':'||show_in_vibes from public.tbl_activity_vibes where id=${old}`),'activity:true');eq(sql(`select visibility||':'||show_in_vibes from public.tbl_activity_vibes where id=${standalone}`),'public:true');
 eq(as(3,'select count(*) from public.tbl_activity_vibes where event_id=1'),'5');
 eq(as(3,'select count(*) from public.tbl_activity_vibes where show_in_vibes and event_id=1'),'4');
 eq(as(3,`select id from public.tbl_activity_vibes where id=${hidden}`),hidden);
 eq(as(1,'select count(*) from public.tbl_activity_vibes where event_id=1'),'5');
 for(const who of [4,5]){eq(as(who,'select count(*) from public.tbl_activity_vibes where event_id=1'),'0');eq(as(who,`select count(*) from public.tbl_activity_vibes where id=${hidden}`),'0');assert.throws(()=>create(who,1,'public',true),/Join or host/);checks++;}
 eq(as(5,`select count(*) from public.tbl_activity_vibes where id=${standalone}`),'1');
 // Direct owner writes cannot widen an Activity audience, and another member
 // cannot change the owner's feed choice even though they can view its media.
 as(2,`update public.tbl_activity_vibes set visibility='public' where id=${hidden};select visibility from public.tbl_activity_vibes where id=${hidden};`);
 eq(sql(`select visibility from public.tbl_activity_vibes where id=${hidden}`),'activity');
 as(3,`update public.tbl_activity_vibes set show_in_vibes=true where id=${hidden};`);eq(sql(`select show_in_vibes from public.tbl_activity_vibes where id=${hidden}`),'f');
 sql("update public.tbl_event_participants set status='left' where user_id=3;");eq(as(3,'select count(*) from public.tbl_activity_vibes where event_id=1'),'0');
 assert.throws(()=>create(2,1,'activity','null'),/Choose whether/);checks++;
 assert.throws(()=>sql("set role anon;select public.vibe_create(1,'x','image','x','{}','public',true)"),/permission denied/);checks++;
 assert.throws(()=>sql("set role anon;select public.vibe_create(1,'x','image','x','{}','public')"),/permission denied/);checks++;
 eq(sql("select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='vibe_create' and pronargdefaults<>0"),'0');
 console.log(JSON.stringify({status:'PASS',checks,scope:'Real PostgreSQL new/legacy RPC, feed opt-in/out persistence, Activity/detail versus global query semantics, legacy audience narrowing, forged public/direct write protection, participant/Host/pending/outsider/left RLS and ordinary/anon permissions. No remote writes.'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
