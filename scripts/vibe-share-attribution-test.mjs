import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

function pureFunction(file, name, globals = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration);
  const compiled = ts.transpileModule(`${declaration.getText(ast)}\nexports.testFunction=${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { exports: {}, ...globals };
  vm.runInNewContext(compiled, sandbox);
  return sandbox.exports.testFunction;
}
const handle = pureFunction('src/components/ShareToChatModal.tsx', 'shareRecipientHandle');
for (const [input, expected] of [['name','@name'],['@name','@name'],['@@name','@name'],[' @name ','@name'],['',''],['@@','']]) {
  assert.equal(handle(input), expected);
}
const map = pureFunction('src/services/realtime-chat.ts', 'mapSharePayload', {
  record: value => value && typeof value === 'object' ? value : {},
  nullableString: value => value == null ? null : String(value),
});
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wenitro-share-attribution-test-'));
const database = path.join(directory, 'database');
let started = false;
function run(command, args, input) {
  const result = spawnSync(command,args,{input,encoding:'utf8',maxBuffer:4*1024*1024});
  if (result.error || result.status !== 0) throw new Error(`${command}: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
}
try {
  run('initdb',['-D',database,'-A','trust','--no-locale']);
  run('pg_ctl',['-D',database,'-l',path.join(directory,'postgres.log'),'-o',`-F -h '' -k ${directory} -p 55439`,'-w','start']);
  started=true;
  const original=fs.readFileSync('supabase/migrations/20260923134835_allow_authenticated_community_chat_shares.sql','utf8');
  const upgrade=fs.readFileSync('supabase/migrations/20260924091853_vibe_share_creator_attribution.sql','utf8');
  const output=run('psql',['-h',directory,'-p','55439','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],`
create role anon; create role authenticated;
create table public.tbl_users(id integer primary key,username text,fullname text,profile_image text);
create table public.tbl_chat_rooms(id integer primary key,room_type text);
create table public.tbl_activity_vibes(id bigint primary key,user_id integer,caption text,event_id bigint,thumbnail_url text,media_url text,visibility text);
create table public.tbl_messages(id integer generated always as identity primary key,room_id integer,sender_id integer,content text,message_type text,client_id uuid,is_delivered boolean,share_payload jsonb);
create unique index on public.tbl_messages(sender_id,client_id) where client_id is not null;
create function public.get_current_app_user_id() returns integer language sql as 'select 1';
create function public.is_event_participant(integer) returns boolean language sql as 'select false';
create function public.assert_chat_membership(integer) returns void language plpgsql as $$ begin if $1<>187 then raise exception 'Not a member'; end if; end $$;
insert into public.tbl_users values(1,'qa_sender','QA Sender',null),(2,'qa_creator','QA Creator',null);
insert into public.tbl_chat_rooms values(187,'community');
insert into public.tbl_activity_vibes values(99,2,'QA share',null,'qa-camera.jpg','qa-vibe.jpg','public'),(100,2,'Private QA',null,null,null,'private');
${original}
${upgrade}
select share->'share_payload' from public.send_chat_share(array[187],array['11111111-1111-4111-8111-111111111111'::uuid],'vibe',99) share;
do $$ declare blocked boolean; begin
  blocked:=false;
  begin perform public.send_chat_share(array[999],array['22222222-2222-4222-8222-222222222222'::uuid],'vibe',99); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Membership check bypassed'; end if;
  blocked:=false;
  begin perform public.send_chat_share(array[187],array['33333333-3333-4333-8333-333333333333'::uuid],'vibe',100); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Private visibility bypassed'; end if;
  if (select count(*) from public.tbl_messages)<>1 then raise exception 'Unauthorized share persisted'; end if;
end $$;
`);
  const persisted=JSON.parse(output.trim());
  assert.equal(persisted.creator_id,'2');
  assert.equal(persisted.creator_name,'QA Creator');
  assert.equal(persisted.shared_by,1);
  assert.equal(persisted.entity_id,'99');
  assert.equal(persisted.deep_link,'#/vibe/99');
  const client=map(persisted);
  assert.equal(client.creatorId,'2');
  assert.equal(client.creatorName,'QA Creator');
  assert.equal(client.sharedBy,1);
  assert.equal(map({kind:'vibe',entity_id:'99',shared_by:1}).creatorName,null,'Legacy cards must not fabricate a creator');
  const app=fs.readFileSync('App.tsx','utf8');
  const community=fs.readFileSync('src/components/community/reference-community.tsx','utf8');
  assert.ok(app.includes('creatorName: rawShare.creatorName ?? rawShare.creator_name ?? null'));
  assert.ok(app.includes('creatorName: item.author'));
  assert.ok(app.includes('Created by {message.share.creatorName}'));
  assert.ok(community.includes('Created by {message.share_payload.creatorName}'));
  assert.ok(community.includes('Shared by {message.profiles?.full_name'));
  console.log('PASS: six handle cases; actual local share RPC creator persistence; distinct sender/creator mapping; legacy compatibility; unchanged membership and Vibe visibility checks; both chat renderers.');
  console.log('Isolated local PostgreSQL only; no production mutations.');
} finally {
  if(started) run('pg_ctl',['-D',database,'-m','fast','-w','stop']);
  fs.rmSync(directory,{recursive:true,force:true});
}
