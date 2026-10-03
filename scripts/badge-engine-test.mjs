import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wenitro-badges-'));
let started = false;
const run = (command, args, input) => {
 const result = spawnSync(command, args, { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
 if (result.error || result.status) throw Error(result.error?.message || result.stderr || result.stdout);
 return result.stdout;
};
const sql = query => run('psql', ['-h', temp, '-p', '55443', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], query);
try {
 run('initdb', ['-D', path.join(temp, 'db'), '-A', 'trust', '--no-locale', '-E', 'UTF8']);
 run('pg_ctl', ['-D', path.join(temp, 'db'), '-l', path.join(temp, 'postgres.log'), '-o', `-F -h '' -k ${temp} -p 55443`, '-w', 'start']); started = true;
 sql(`
 create role anon; create role authenticated; create role service_role;
 create schema private; create schema auth; grant usage on schema private,auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select case when nullif(current_setting('qa.user',true),'') is not null then ('00000000-0000-0000-0000-'||lpad(current_setting('qa.user',true),12,'0'))::uuid end$$;
 create function public.get_current_app_user_id() returns integer language sql as $$select nullif(current_setting('qa.user',true),'')::integer$$;
 create function private.can_read_profile(integer) returns boolean language sql as $$select $1<>110$$;
 create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz);
 create table public.tbl_users(id integer primary key,auth_user_id uuid,is_active integer default 1,is_delete integer default 0,deactivated_at timestamptz);
 create table public.tbl_badges(id serial primary key,slug text unique,name text,description text,icon text);
 create table public.tbl_user_badges(user_id integer references public.tbl_users,badge_id integer references public.tbl_badges,awarded_at timestamptz default now(),awarded_by integer,primary key(user_id,badge_id));
 alter table public.tbl_user_badges enable row level security;
 create policy user_badges_read on public.tbl_user_badges for select to authenticated using(true);
 create table public.tbl_events(id integer primary key,created_by integer,is_deleted boolean default false,is_cancelled boolean default false,status text default 'published',event_end_time timestamptz default now()-interval '1 day',payment_collection_mode text default 'none',is_paid boolean default false);
 create table public.tbl_event_participants(event_id integer,user_id integer,status text);
 create table public.tbl_activity_payments(event_id integer,user_id integer,status text,financial_status text default 'PAYABLE');
 create table public.tbl_chat_rooms(id integer primary key,room_type text default 'community',created_by integer default 2);
 create table public.tbl_chat_participants(room_id integer,user_id integer);
 create table public.tbl_community_posts(id bigint,room_id integer,user_id integer,deleted_at timestamptz);
 create table public.tbl_referral_history(id integer,referrer_id integer,referred_user_id integer,points_awarded integer default 10);
 create table public.tbl_partner_profiles(user_id integer primary key,status text);
 insert into public.tbl_users(id,auth_user_id) select n,('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,110)n;
 insert into auth.users select auth_user_id,'qa'||id||'@example.test',null,now(),null from public.tbl_users;
 ${fs.readFileSync('supabase/migrations/20261002170748_client_badge_engine.sql', 'utf8')}
 ${fs.readFileSync('supabase/migrations/20261003052115_popular_partner_qualifying_participants.sql', 'utf8')}
 `);
 const rules = JSON.parse(sql("select json_agg(json_build_object('slug',slug,'metric',metric,'threshold',threshold)) from public.tbl_badges;"));
 // Independent expectations transcribed from the supplied WeNitro Badges document.
 const expected = [
 ['activity-explorer','joined',1],['active-explorer','joined',5],['adventure-seeker','joined',10],['activity-pro','joined',25],
 ['first-time-host','hosted',1],['active-host','hosted',5],['experienced-host','hosted',10],['hosting-veteran','hosted',25],
 ['community-starter','communities',1],['community-contributor','posts',5],['conversation-starter','posts',10],['community-explorer','communities',5],
 ['first-connector','referrals',1],['network-builder','referrals',5],['community-connector','referrals',10],
 ['first-activity','completed',1],['10-activities','completed',10],['25-activities','completed',25],['50-activities','completed',50],
 ['verified-partner','partner',1],['active-partner','partner_hosted',5],['popular-partner','partner_participants',100]
 ];
 assert.deepEqual(rules.map(r=>[r.slug,r.metric,r.threshold]).sort(), expected.sort(), 'Client document catalog');
 const reset = `truncate public.tbl_user_badges,public.tbl_events,public.tbl_event_participants,public.tbl_activity_payments,public.tbl_chat_rooms,public.tbl_chat_participants,public.tbl_community_posts,public.tbl_referral_history,public.tbl_partner_profiles,private.badge_disqualifications;`;
 const fixture = (metric, n) => {
  if (metric==='joined'||metric==='completed') return `insert into public.tbl_events(id,created_by,event_end_time) select n,2,now()+interval '${metric==='joined'?'1':'-1'} day' from generate_series(1,${n})n; insert into public.tbl_event_participants select id,1,'approved' from public.tbl_events;`;
  if (metric==='hosted'||metric==='partner_hosted') return `insert into public.tbl_events(id,created_by,is_paid,payment_collection_mode) select n,1,${metric==='partner_hosted'},'${metric==='partner_hosted'?'cashfree':'none'}' from generate_series(1,${n})n; insert into public.tbl_partner_profiles values(1,'APPROVED');`;
  if (metric==='communities') return `insert into public.tbl_chat_rooms(id) select n from generate_series(1,${n})n; insert into public.tbl_chat_participants select id,1 from public.tbl_chat_rooms;`;
  if (metric==='posts') return `insert into public.tbl_chat_rooms(id) values(1); insert into public.tbl_community_posts(id,room_id,user_id) select n,1,1 from generate_series(1,${n})n;`;
  if (metric==='referrals') return `insert into public.tbl_referral_history(id,referrer_id,referred_user_id) select n,1,n+1 from generate_series(1,${n})n;`;
  if (metric==='partner') return n ? `insert into public.tbl_partner_profiles values(1,'APPROVED');` : '';
  if (metric==='partner_participants') return `insert into public.tbl_partner_profiles values(1,'APPROVED'); insert into public.tbl_events(id,created_by,is_paid,payment_collection_mode) values(1,1,true,'cashfree'); insert into public.tbl_event_participants select 1,n+1,'approved' from generate_series(1,${n})n; insert into public.tbl_activity_payments(event_id,user_id,status) select event_id,user_id,'paid' from public.tbl_event_participants;`;
  throw Error(metric);
 };
 let boundaries = 0;
 for (const rule of rules) for (const n of new Set([0,rule.threshold-1,rule.threshold,rule.threshold+1])) {
  const result = sql(`${reset}${fixture(rule.metric,n)} select private.reconcile_client_badges(1); select count(*) from public.tbl_user_badges ub join public.tbl_badges b on b.id=ub.badge_id where b.slug='${rule.slug}' and ub.revoked_at is null;`).trim().split('\n').at(-1);
  assert.equal(result,n>=rule.threshold?'1':'0',`${rule.slug}: ${n}`); boundaries++;
 }
 // Independent client-document scenario: Popular Partner includes free events;
 // only Active Partner explicitly requires paid activities in the specification.
 sql(`${reset}${fixture('partner_participants',100)}
 update public.tbl_events set is_paid=false,payment_collection_mode='none';
 truncate public.tbl_activity_payments;
 do $$ begin
 if (private.badge_metrics(1)->>'partner_participants')::int<>100 then raise exception 'Qualifying free participants excluded'; end if;
 if (private.badge_metrics(1)->>'partner_hosted')::int<>0 then raise exception 'Free event counted for paid Active Partner'; end if;
 perform private.reconcile_client_badges(1);
 if not exists(select 1 from public.tbl_user_badges ub join public.tbl_badges b on b.id=ub.badge_id where b.slug='popular-partner' and ub.revoked_at is null) then raise exception 'Popular Partner not awarded'; end if;
 update public.tbl_events set is_deleted=true;
 perform private.reconcile_client_badges(1);
 if exists(select 1 from public.tbl_user_badges ub join public.tbl_badges b on b.id=ub.badge_id where b.slug='popular-partner' and ub.revoked_at is null) then raise exception 'Removed Activity still counted'; end if;
 end $$;`);
 sql(`${reset}${fixture('completed',25)}
 do $$ declare original timestamptz; snapshot jsonb; begin
 perform private.reconcile_client_badges(1);
 select awarded_at,criteria_snapshot into original,snapshot from public.tbl_user_badges where user_id=1 order by badge_id limit 1;
 perform private.reconcile_client_badges(1);
 if (select count(*) from public.tbl_user_badges)<>7 then raise exception 'Duplicate award or missing badge'; end if;
 if not exists(select 1 from public.tbl_user_badges where awarded_at=original and criteria_snapshot=snapshot) then raise exception 'Snapshot modified on repeat'; end if;
 -- Duplicate registration rows never increase progress.
 insert into public.tbl_event_participants select * from public.tbl_event_participants;
 if (private.badge_metrics(1)->>'completed')::int<>25 then raise exception 'Duplicate participation counted'; end if;
 update public.tbl_events set is_cancelled=true;
 perform private.reconcile_client_badges(1);
 if exists(select 1 from public.tbl_user_badges where revoked_at is null) then raise exception 'Cancelled award stayed active'; end if;
 if (select count(*) from public.tbl_user_badges)<>7 then raise exception 'Revocation erased audit'; end if;
 end $$;
 ${reset}${fixture('partner_participants',100)}
 update public.tbl_activity_payments set status='failed' where user_id=2;
 update public.tbl_event_participants set status='left' where user_id=3;
 update public.tbl_users set is_active=0 where id=4;
 insert into public.tbl_event_participants values(1,1,'approved');
 do $$ begin if (private.badge_metrics(1)->>'partner_participants')::int<>97 then raise exception 'Invalid paid participant counted'; end if; end $$;
 update public.tbl_users set is_active=1 where id=4;
 ${reset}${fixture('posts',10)}
 update public.tbl_community_posts set deleted_at=now() where id=1;
 insert into private.badge_disqualifications values('post',2,'Spam confirmed by moderator',now());
 do $$ begin if (private.badge_metrics(1)->>'posts')::int<>8 then raise exception 'Deleted/spam post counted'; end if; end $$;
 ${reset}${fixture('referrals',10)}
 insert into public.tbl_referral_history values(20,1,1,10),(21,1,2,10);
 update auth.users set email='dupe.name@gmail.com' where id=(select auth_user_id from public.tbl_users where id=2);
 update auth.users set email='d.u.p.e.name+farm@googlemail.com' where id=(select auth_user_id from public.tbl_users where id=3);
 update auth.users set email_confirmed_at=null where id=(select auth_user_id from public.tbl_users where id=4);
 insert into private.badge_disqualifications values('referral',4,'Referral farm confirmed',now());
 do $$ begin if (private.badge_metrics(1)->>'referrals')::int<>7 then raise exception 'Invalid referral counted'; end if; end $$;
 -- Public boundary: no unauthenticated execution, arbitrary self-awards or criteria/identity leakage.
 select set_config('qa.user','1',false);
 set role authenticated;
 do $$ declare result jsonb; begin
 result:=public.profile_achievements(1);
 if jsonb_array_length(result)<>22 then raise exception 'Catalog incomplete'; end if;
 if result::text like '%criteria_snapshot%' or result::text like '%referred_user_id%' then raise exception 'Audit leak'; end if;
 if exists(select 1 from jsonb_array_elements(public.profile_achievements(2)) b where b->>'progress' is not null) then raise exception 'Other profile private progress leaked'; end if;
 begin perform public.profile_achievements(110); raise exception 'Private profile leak'; exception when insufficient_privilege then null; end;
 begin perform private.reconcile_client_badges(1); raise exception 'Internal award API exposed'; exception when insufficient_privilege then null; end;
 begin insert into public.tbl_user_badges(user_id,badge_id) values(1,1); raise exception 'Self award allowed'; exception when insufficient_privilege then null; end;
 begin perform criteria_snapshot from public.tbl_user_badges; raise exception 'Snapshot visible'; exception when insufficient_privilege then null; end;
 end $$;
 reset role; set role anon;
 do $$ begin
 begin perform public.profile_achievements(1); raise exception 'Anonymous endpoint access'; exception when insufficient_privilege then null; end;
 end $$;
 `);
 console.log(`PASS: all 22 badges, ${boundaries} threshold boundaries, idempotency/audit preservation, cancelled/failed/duplicate/suspended/self exclusions, spam removal, referral alias anti-farming, private profile/API security.`);
} finally {
 if (started) run('pg_ctl',['-D',path.join(temp,'db'),'-m','immediate','-w','stop']);
 fs.rmSync(temp,{recursive:true,force:true});
}
