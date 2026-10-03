import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wenitro-anonymous-media-'));
const database = path.join(directory, 'database');
const run = (command, args, input) => {
  const result = spawnSync(command, args, { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status) throw Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout;
};
let started = false;
try {
  run('initdb', ['-D', database, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  run('pg_ctl', ['-D', database, '-l', path.join(directory, 'postgres.log'), '-o', `-F -h '' -k ${directory} -p 55442`, '-w', 'start']); started = true;
  const migration = fs.readFileSync('supabase/migrations/20261003050836_anonymous_community_media_privacy.sql', 'utf8');
  const output = run('psql', ['-h', directory, '-p', '55442', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], `
create role anon; create role authenticated;
create schema auth; create schema private; create schema storage;
grant usage on schema public,private,storage,auth to authenticated;
create function auth.uid() returns uuid language sql as $$select case when current_setting('qa.user',true)<>'' then '00000000-0000-0000-0000-000000000001'::uuid end$$;
create function public.get_current_app_user_id() returns integer language sql as $$select nullif(current_setting('qa.user',true),'')::integer$$;
create function public.is_wenitro_admin() returns boolean language sql as $$select coalesce(current_setting('qa.user',true)='99',false)$$;
create function public.assert_chat_membership(integer) returns boolean language plpgsql as $$begin if current_setting('qa.user',true) not in ('70','71','99') then raise exception 'Not a member' using errcode='42501'; end if; return true; end$$;
create table public.tbl_users(id integer primary key,username text,fullname text,profile_image text);
insert into public.tbl_users values(70,'qa70','QA Host','known-author-uuid/photo.png'),(71,'qa71','QA Viewer',null);
create table public.tbl_chat_rooms(id integer primary key,room_type text);
insert into public.tbl_chat_rooms values(244,'community');
create table public.tbl_community_posts(id bigint primary key,room_id integer,user_id integer,media_url text,is_anonymous boolean,deleted_at timestamptz,created_at timestamptz default now());
insert into public.tbl_community_posts values(1,244,70,'known-author-uuid/post/anonymous.png',true,null,now()),(2,244,70,'known-author-uuid/post/named.png',false,null,now());
grant select(id,room_id,media_url,is_anonymous,created_at) on public.tbl_community_posts to authenticated;
create table storage.objects(bucket_id text,name text);
insert into storage.objects values('communities','known-author-uuid/post/anonymous.png'),('communities','known-author-uuid/post/named.png'),('avatars','known-author-uuid/photo.png');
alter table storage.objects enable row level security;
grant select on storage.objects to authenticated;
create policy existing_read on storage.objects for select to authenticated using(true);
${migration}
set role authenticated;
select set_config('qa.user','71',false);
do $$ declare payload jsonb; begin
  payload:=public.community_list_posts(244);
  if payload->'items' @> '[{"id":1,"media_url":"known-author-uuid/post/anonymous.png"}]' then raise exception 'anonymous media path leaked'; end if;
  if not payload->'items' @> '[{"id":1,"media_url":"anonymous-media:1","author_id":null,"author":{"username":"anonymous"}}]' then raise exception 'redaction missing'; end if;
  if not payload->'items' @> '[{"id":2,"media_url":"known-author-uuid/post/named.png","author_id":70}]' then raise exception 'named regression'; end if;
  if (select count(*) from storage.objects)<>2 then raise exception 'storage owner correlation leak'; end if;
  begin perform media_url from public.tbl_community_posts; raise exception 'raw column leaked'; exception when insufficient_privilege then null; end;
  perform id from public.tbl_community_posts;
  perform set_config('qa.user','70',true);
  if (select count(*) from storage.objects)<>3 then raise exception 'owner cleanup denied'; end if;
  perform set_config('qa.user','99',true);
  if not public.community_list_posts(244)->'items' @> '[{"id":1,"author_id":70}]' then raise exception 'admin audit lost'; end if;
  if (select count(*) from storage.objects)<>3 then raise exception 'admin storage denied'; end if;
  perform set_config('qa.user','72',true);
  begin perform public.community_list_posts(244); raise exception 'nonmember leaked'; exception when insufficient_privilege then null; end;
end $$;
select 'PASS anonymous RPC, raw-column denial, restrictive Storage RLS, named posts, owner cleanup, Admin audit, nonmember denial';
`);
  assert.match(output, /PASS anonymous RPC/); console.log(output.trim());
} finally {
  if (started) run('pg_ctl', ['-D', database, '-m', 'fast', '-w', 'stop']);
  fs.rmSync(directory, { recursive: true, force: true });
}
