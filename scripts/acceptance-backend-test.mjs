import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wenitro-acceptance-test-'));
const database = path.join(directory, 'database');
let started = false;
function run(command, args, input) {
  const r = spawnSync(command, args, { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (r.error || r.status) throw Error(r.error?.message || r.stderr || r.stdout);
  return r.stdout;
}
try {
  run('initdb', ['-D', database, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  run('pg_ctl', ['-D', database, '-l', path.join(directory, 'postgres.log'), '-o', `-F -h '' -k ${directory} -p 55441`, '-w', 'start']); started = true;
  const announcements = fs.readFileSync('supabase/migrations/20261001110209_acceptance_login_announcements.sql', 'utf8');
  const moderation = fs.readFileSync('supabase/migrations/20261001110210_acceptance_text_content_guards.sql', 'utf8');
  const comments = fs.readFileSync('supabase/migrations/20261001111357_activity_comment_eligibility.sql', 'utf8');
  const pinning = fs.readFileSync('supabase/migrations/20261001111919_admin_activity_pinning.sql', 'utf8');
  const chatMedia = fs.readFileSync('supabase/migrations/20261001112539_chat_photo_poll_only.sql', 'utf8');
  const closedChat = fs.readFileSync('supabase/migrations/20261001114800_closed_activity_chat_writes.sql', 'utf8');
  const tables = [...moderation.matchAll(/on public\.(\w+) for each row/g)].map(m => m[1]);
  const output = run('psql', ['-h', directory, '-p', '55441', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], `
create role anon; create role authenticated; create schema private; create schema auth;
create function auth.uid() returns uuid language sql as $$select case when current_setting('qa.user',true)<>'' then '00000000-0000-0000-0000-000000000001'::uuid end$$;
create function public.get_current_app_user_id() returns integer language sql as $$select nullif(current_setting('qa.user',true),'')::integer$$;
create function public.is_wenitro_admin() returns boolean language sql as $$select coalesce(current_setting('qa.user',true)='1',false)$$;
create table public.tbl_users(id integer primary key,fullname text,bio text);
insert into public.tbl_users(id) values(1),(2),(3);
${announcements}
${tables.filter(t => t !== 'tbl_users').map(t => `create table public.${t}(id integer,body text,title text,content text);`).join('\n')}
${moderation}
alter table public.tbl_events add column created_by integer, add column is_deleted boolean default false, add column is_cancelled boolean default false, add column status text default 'published';
alter table public.tbl_event_comments add column event_id integer, add column user_id integer;
create table public.tbl_event_participants(event_id integer,user_id integer,status text);
create function public.can_read_event(integer) returns boolean language sql as $$select true$$;
${comments}
alter table public.tbl_events add column event_start_time timestamptz, add column updated_at timestamptz, add column updated_by integer;
${pinning}
alter table public.tbl_messages add column message_type text, add column media_url text;
insert into public.tbl_messages(id,message_type,media_url) values(1,'video','legacy.mp4');
${chatMedia}
alter table public.tbl_messages add column room_id integer;
alter table public.tbl_chat_rooms add column event_id integer;
${closedChat}
select set_config('qa.user','1',false);
select public.admin_create_login_announcement('QA','Hello',now()-interval '1 minute',now()+interval '1 day',array[2]);
do $$ begin
  perform set_config('qa.user','2',true);
  if jsonb_array_length(public.my_login_announcements())<>1 then raise exception 'target missing'; end if;
  perform public.acknowledge_login_announcement(1);
  perform public.acknowledge_login_announcement(1);
  if jsonb_array_length(public.my_login_announcements())<>0 then raise exception 'receipt duplicate'; end if;
  if (select count(*) from public.tbl_login_announcement_receipts)<>1 then raise exception 'receipt not idempotent'; end if;
  begin perform public.admin_create_login_announcement('Bad','Bad',now(),now()+interval '1 day',null); raise exception 'admin bypass'; exception when insufficient_privilege then null; end;
  perform set_config('qa.user','3',true);
  if jsonb_array_length(public.my_login_announcements())<>0 then raise exception 'audience leak'; end if;
  begin perform public.acknowledge_login_announcement(1); raise exception 'receipt audience bypass'; exception when insufficient_privilege then null; end;
  begin insert into public.tbl_events(title) values('fucking'); raise exception 'moderation bypass'; exception when sqlstate '22023' then null; end;
  insert into public.tbl_events(id,title) values(1,'Scunthorpe social');
  begin update public.tbl_events set title='ＦＵＣＫ' where id=1; raise exception 'unicode bypass'; exception when sqlstate '22023' then null; end;
  update public.tbl_events set body='harmless' where id=1;
  update public.tbl_events set created_by=2 where id=1;
  insert into public.tbl_chat_rooms(id,event_id) values(1,1);
  insert into public.tbl_messages(room_id,content,message_type) values(1,'before cancellation','text');
  update public.tbl_events set is_cancelled=true where id=1;
  begin insert into public.tbl_messages(room_id,content,message_type) values(1,'after cancellation','text'); raise exception 'cancelled chat accepts writes'; exception when insufficient_privilege then null; end;
  update public.tbl_events set is_cancelled=false where id=1;
  begin insert into public.tbl_event_comments(event_id,user_id,body) values(1,3,'not joined'); raise exception 'nonparticipant comment bypass'; exception when insufficient_privilege then null; end;
  insert into public.tbl_event_participants values(1,3,'pending');
  begin insert into public.tbl_event_comments(event_id,user_id,body) values(1,3,'pending'); raise exception 'pending comment bypass'; exception when insufficient_privilege then null; end;
  update public.tbl_event_participants set status='approved';
  insert into public.tbl_event_comments(event_id,user_id,body) values(1,3,'approved');
  update public.tbl_event_participants set status='left';
  begin update public.tbl_event_comments set body='left edit'; raise exception 'left edit bypass'; exception when insufficient_privilege then null; end;
  perform set_config('qa.user','2',true);
  insert into public.tbl_event_comments(event_id,user_id,body) values(1,2,'host');
  perform set_config('qa.user','1',true);
  update public.tbl_event_comments set body='admin moderation';
  update public.tbl_events set event_start_time=now()+interval '1 day' where id=1;
  perform public.admin_set_activity_pinned(1,true);
  if not (select is_admin_pinned from public.tbl_events where id=1) then raise exception 'pin not saved'; end if;
  perform set_config('qa.user','2',true);
  begin perform public.admin_set_activity_pinned(1,false); raise exception 'nonadmin pin bypass'; exception when insufficient_privilege then null; end;
  begin update public.tbl_events set is_admin_pinned=false where id=1; raise exception 'direct pin bypass'; exception when insufficient_privilege then null; end;
  perform set_config('qa.user','1',true);
  perform public.admin_set_activity_pinned(1,false);
  update public.tbl_messages set content='legacy history remains readable' where id=1;
  begin insert into public.tbl_messages(message_type,media_url) values('video','new.mp4'); raise exception 'video bypass'; exception when sqlstate '22023' then null; end;
  begin insert into public.tbl_messages(message_type,media_url) values('image','new.MP4?x=1'); raise exception 'disguised video bypass'; exception when sqlstate '22023' then null; end;
  insert into public.tbl_messages(message_type,media_url) values('image','photo.png');
end $$;
select 'PASS: announcement audience, authorization, receipt idempotency, explicit-word guard, Unicode normalization, innocent substrings and unchanged-field updates';
`);
  assert.match(output, /PASS:/); console.log(output.trim());
} finally {
  if (started) run('pg_ctl', ['-D', database, '-m', 'fast', '-w', 'stop']);
  fs.rmSync(directory, { recursive: true, force: true });
}
