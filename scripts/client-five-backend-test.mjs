import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wenitro-client-five-'));
let started = false;
const run = (bin, args, input) => {
  const result = spawnSync(bin, args, { input, encoding: 'utf8', maxBuffer: 8e6 });
  if (result.error || result.status) throw new Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout;
};
const sql = query => run('psql', ['-h', root, '-p', '55446', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], query);
const migration = fs.readFileSync('supabase/migrations/20261006150000_client_phone_groups_stories_polls_reports.sql', 'utf8');
const rlsHardening = fs.readFileSync('supabase/migrations/20261006173000_report_and_verification_rls_hardening.sql', 'utf8');

try {
  run('initdb', ['-D', `${root}/db`, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  run('pg_ctl', ['-D', `${root}/db`, '-l', `${root}/server.log`, '-o', `-F -h '' -k ${root} -p 55446`, '-w', 'start']);
  started = true;
  sql(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    grant usage on schema public,auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('qa.uid',true),'')::uuid $$;
    create table public.tbl_users(id int primary key,auth_user_id uuid,username text,fullname text,profile_image text,isverified int,is_delete int default 0,is_active int default 1);
    insert into public.tbl_users(id,auth_user_id,username,fullname) values
      (1,'00000000-0000-0000-0000-000000000001','owner','Owner'),
      (2,'00000000-0000-0000-0000-000000000002','squad_two','Squad Two'),
      (3,'00000000-0000-0000-0000-000000000003','squad_three','Squad Three'),
      (4,'00000000-0000-0000-0000-000000000004','unrelated','Unrelated'),
      (9,'00000000-0000-0000-0000-000000000009','admin','Admin');
    create table public.tbl_friends(id serial primary key,user_id int,friend_id int,created_at timestamptz default now());
    insert into public.tbl_friends(user_id,friend_id) values(1,2),(3,1);
    create table public.tbl_user_blocks(blocker_id int,blocked_id int,created_at timestamptz default now(),primary key(blocker_id,blocked_id));
    create function public.get_current_app_user_id() returns int language sql stable security definer set search_path='' as $$ select id from public.tbl_users where auth_user_id=auth.uid() $$;
    create function public.current_app_user_id() returns int language sql stable security definer set search_path='' as $$ select id from public.tbl_users where auth_user_id=auth.uid() $$;
    create function public.is_wenitro_admin() returns boolean language sql stable as $$ select public.current_app_user_id()=9 $$;
    create function private.users_blocked(a int,b int) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.tbl_user_blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a)) $$;
    create table public.tbl_chat_rooms(id serial primary key,room_type text not null,created_by int,title text,image_url text);
    create table public.tbl_chat_participants(room_id int,user_id int,role text,permissions jsonb,primary key(room_id,user_id));
    create table public.tbl_chat_polls(id serial primary key,room_id int references public.tbl_chat_rooms(id),question text default 'QA',created_by int default 1,client_id uuid);
    create table public.tbl_stories(id bigserial primary key,user_id int,media_url text,media_type text,caption text default '',created_at timestamptz default now(),expires_at timestamptz default now()+interval '24 hours',deleted_at timestamptz);
    create table public.tbl_user_reports(id serial primary key,target_user_id int,reporter_id int,reason text,description text,status text default 'open',created_at timestamptz default now());
    create table public.tbl_user_verification(id serial primary key,user_id int,phone_verified boolean default false);
    create table public.tbl_event_reports(id serial primary key,event_id int,reporter_id int,reason text,description text,status text default 'open',created_at timestamptz default now());
    create table private.admin_operation_audit(id serial primary key,actor_id uuid,target_type text,target_id int,action text,reason text,previous_state jsonb,next_state jsonb,created_at timestamptz default now());
    create function private.protect_report_review_status() returns trigger language plpgsql security definer set search_path='' as $$ begin if not public.is_wenitro_admin() then if tg_op='INSERT' then new.status:='open'; elsif new.status is distinct from old.status then raise exception 'Only an administrator can review reports' using errcode='42501'; end if; end if; return new; end $$;
    create function private.create_group_chat_room_secure(p_title text,p_member_ids integer[],p_image_path text) returns int language sql as $$ select 0 $$;
    create function public.create_group_chat_room(p_title text,p_member_ids integer[]) returns int language sql security definer set search_path='' as $$ select private.create_group_chat_room_secure(p_title,p_member_ids,null) $$;
    create function public.create_group_chat_room(p_title text,p_member_ids integer[],p_image_path text) returns int language sql security definer set search_path='' as $$ select private.create_group_chat_room_secure(p_title,p_member_ids,p_image_path) $$;
    grant execute on function public.create_group_chat_room(text,integer[]),public.create_group_chat_room(text,integer[],text) to authenticated;
    create function private.account_is_allowed() returns boolean language sql stable as $$ select true $$;
    alter table public.tbl_user_reports enable row level security;
    alter table public.tbl_user_verification enable row level security;
    create policy admin_suspension_guard on public.tbl_user_reports for all to authenticated using ((select private.account_is_allowed())) with check ((select private.account_is_allowed()));
    create policy admin_suspension_guard on public.tbl_user_verification for all to authenticated using ((select private.account_is_allowed())) with check ((select private.account_is_allowed()));
    create policy member_report_read on public.tbl_user_reports for select to authenticated using (reporter_id=(select public.current_app_user_id()));
    create policy report_admin_all on public.tbl_user_reports for all to authenticated using (public.is_wenitro_admin()) with check (public.is_wenitro_admin());
    create policy own_verification on public.tbl_user_verification for select to authenticated using (user_id=public.current_app_user_id());
    create policy verification_admin_all on public.tbl_user_verification for all to authenticated using (public.is_wenitro_admin()) with check (public.is_wenitro_admin());
    grant select,insert,update,delete on public.tbl_user_reports,public.tbl_user_verification to authenticated;
  `);
  sql(migration);
  sql(rlsHardening);
  const asUser = (id, query) => sql(`set role authenticated; select set_config('qa.uid','00000000-0000-0000-0000-${String(id).padStart(12, '0')}',false); ${query}`).trim().split('\n').at(-1);
  const denied = (id, query, expected) => assert.throws(() => asUser(id, query), expected);

  assert.equal(asUser(1, "select jsonb_array_length(public.list_eligible_group_members());"), '2');
  sql('insert into public.tbl_user_blocks(blocker_id,blocked_id) values(1,3);');
  assert.equal(asUser(1, "select public.list_eligible_group_members()->0->>'id';"), '2');
  assert.equal(asUser(1, 'select jsonb_array_length(public.list_eligible_group_members());'), '1');
  denied(1, "select public.create_group_chat_room('QA Group',array[2,3]);", /eligible Squad/);
  sql('delete from public.tbl_user_blocks where blocker_id=1 and blocked_id=3;');
  const roomId = Number(asUser(1, "select public.create_group_chat_room('QA Group',array[2,3]);"));
  assert.equal(sql(`select count(*) from public.tbl_chat_participants where room_id=${roomId};`).trim(), '3');
  denied(1, "select public.create_group_chat_room('Bad Group',array[2,4]);", /eligible Squad/);

  const personal = Number(sql("insert into public.tbl_chat_rooms(room_type,created_by) values('personal',1) returning id;"));
  const group = Number(sql("insert into public.tbl_chat_rooms(room_type,created_by) values('group',1) returning id;"));
  assert.throws(() => sql(`insert into public.tbl_chat_polls(room_id) values(${personal});`), /not available in personal chats/);
  sql(`insert into public.tbl_chat_polls(room_id) values(${group});`);

  const seconds = Number(sql("insert into public.tbl_stories(user_id,media_url,media_type,expires_at) values(1,'qa/path.jpg','image',now()+interval '7 days') returning extract(epoch from (expires_at-created_at));"));
  assert(seconds >= 86399 && seconds <= 86401);

  denied(1, "select public.submit_safety_report('user',1,'spam',null);", /own profile/);
  const userReport = JSON.parse(asUser(1, "select public.submit_safety_report('user',4,'spam','QA user report')::text;"));
  assert.equal(userReport.status, 'open');
  denied(1, "select public.submit_safety_report('user',4,'spam','duplicate');", /already submitted/);
  const community = Number(sql("insert into public.tbl_chat_rooms(room_type,created_by,title) values('community',2,'QA Community') returning id;"));
  const communityReport = JSON.parse(asUser(1, `select public.submit_safety_report('community',${community},'inappropriate_content','QA Community report')::text;`));
  assert.equal(communityReport.type, 'community');
  denied(1, `select public.admin_review_report('community',${communityReport.id},'resolved','Unauthorized review');`, /Administrator/);
  assert.equal(JSON.parse(asUser(9, `select public.admin_review_report('community',${communityReport.id},'reviewing','QA Admin review')::text;`)).status, 'reviewing');
  assert.equal(sql(`select status from public.tbl_community_reports where id=${communityReport.id};`).trim(), 'reviewing');

  sql("insert into public.tbl_user_reports(target_user_id,reporter_id,reason,status) values(1,2,'QA private report','open'); insert into public.tbl_user_verification(user_id) values(1);");
  assert.equal(asUser(1, 'select count(*) from public.tbl_user_reports where reporter_id=2;'), '0');
  denied(1, "update public.tbl_user_reports set status='resolved';", /permission denied/);
  denied(1, 'update public.tbl_user_verification set phone_verified=true where user_id=1;', /permission denied/);

  console.log(JSON.stringify({ status: 'PASS', checks: 19, scope: 'Squad-only group candidates and server validation, blocked-member exclusion, personal poll rejection, exact 24-hour Story expiry, user/community report validation, duplicate protection, Admin-only review, report privacy, and server-authoritative verification writes.' }));
} finally {
  if (started) run('pg_ctl', ['-D', `${root}/db`, '-m', 'immediate', '-w', 'stop']);
  fs.rmSync(root, { recursive: true, force: true });
}
