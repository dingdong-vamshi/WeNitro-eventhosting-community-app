import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wn-google-retention-'));let started=false,checks=0;
const run=(bin,args,input)=>{const r=spawnSync(bin,args,{input,encoding:'utf8',maxBuffer:5e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr||r.stdout);return r.stdout;};
const sql=q=>run('psql',['-h',dir,'-p','55465','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],q).trim();
const source=p=>fs.readFileSync('supabase/migrations/'+p,'utf8');
const liveDefinitions=process.env.GOOGLE_RETENTION_FUNCTION_FIXTURE?JSON.parse(fs.readFileSync(process.env.GOOGLE_RETENTION_FUNCTION_FIXTURE,'utf8')):[];
function fn(file,name){const live=liveDefinitions.find(row=>'public.'+row.proname===name);if(live)return live.definition+';';const s=source(file);const start=s.search(new RegExp('create (?:or replace )?function '+name.replaceAll('.','\\.')+'\\(', 'i'));assert.ok(start>=0,name);const rest=s.slice(start);const delimiter=rest.match(/\bas\s+(\$\w*\$)/i)[1];return rest.slice(0,rest.indexOf(delimiter,rest.indexOf(delimiter)+delimiter.length)+delimiter.length)+';';}
const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};const fail=(f,re)=>{assert.throws(f,re);checks++;};
const as=(id,q,role='authenticated')=>sql(`set role ${role};select set_config('qa.uid','${id===null?'':`00000000-0000-0000-0000-${String(id).padStart(12,'0')}`}',false);${q}`).split('\n').at(-1);
const encode=o=>JSON.stringify(o).replaceAll("'","''");
const create=(id,patch)=>as(id,`select public.create_activity('${encode({title:'Venue fixture',join_type:'direct',...patch})}'::jsonb);`);
const update=(id,event,patch)=>as(id,`select public.update_activity(${event},'${encode(patch)}'::jsonb);`);
const cache=(id='ChIJ_Test',lat='12.3',lng='77.4')=>JSON.parse(as(null,`select public.cache_google_place_coordinates('${id}',${lat},${lng});`,'service_role'));
try{
 run('initdb',['-D',dir+'/db','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',dir+'/db','-l',dir+'/log','-o',`-F -h '' -k ${dir} -p 55465`,'-w','start']);started=true;
 sql(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;create schema cron;
 grant usage on schema auth,private to authenticated;create function auth.uid() returns uuid language sql as $$select coalesce(nullif(current_setting('qa.uid',true),''),nullif(current_setting('request.jwt.claim.sub',true),''))::uuid$$;
 create table auth.users(id uuid primary key,banned_until timestamptz);
 create table public.tbl_users(id int primary key,auth_user_id uuid,fullname text,is_active int default 1,is_delete int default 0,deactivated_at timestamptz);
 insert into auth.users(id) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,3)n;
 insert into public.tbl_users(id,auth_user_id) select n,('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,3)n;
 create table public.tbl_events(id serial primary key,created_by int,updated_by int,title text,description text,event_start_time timestamptz,event_end_time timestamptz,registration_close_time timestamptz,max_participants int,visibility_type text,join_type text,location text,display_location text,latitude numeric,longitude numeric,verified_only boolean,age_min int,age_max int,gender_preference text,location_instruction text,costs_may_apply boolean,entry_fee_required boolean,is_paid boolean,price numeric,currency text,intent text,status text,media jsonb,is_cancelled boolean default false,is_deleted boolean default false,updated_at timestamptz);
 create table public.tbl_categories(id serial primary key,name text);
 create table public.tbl_event_categories(event_id int,category_id int,created_by int,updated_by int,unique(event_id,category_id));
 create table public.tbl_event_participants(event_id int,user_id int,role text,status text);
 create table public.tbl_chat_rooms(id int,event_id int,updated_at timestamptz,room_type text,created_by int);
 create table private.qa_questions(event_id int,questions jsonb);
 create function private.save_activity_registration_questions(integer,jsonb) returns void language sql as $$insert into private.qa_questions values($1,$2)$$;
 -- Local Cron contract stub: actual retention SQL is exercised below; scheduler extension is not simulated.
 create table cron.job(jobname text primary key,schedule text,command text,active boolean default true);
 create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning 1::bigint$$;
 ${fn('20261003075305_account_status_rpc_enforcement.sql','private.account_is_allowed')}
 ${fn('20261003065531_admin_operational_controls.sql','public.current_app_user_id')}
 ${fn('20260908103402_phase4_privacy_enforcement.sql','public.get_current_app_user_id')}
 ${fn('20260930192948_enforce_ended_activity_mutation_guards.sql','private.assert_activity_mutable')}
 ${fn('20260922184242_client_pdf_security_completion.sql','private.can_manage_activity')}
 ${fn('20260922184242_client_pdf_security_completion.sql','private.validate_host_activity_fields')}
 create trigger validate_host_activity_fields before insert or update on public.tbl_events for each row execute function private.validate_host_activity_fields();
 ${fn('20260910091043_activity_cost_flags.sql','public.create_activity')}
 ${fn('20261003074100_admin_category_catalog.sql','public.update_activity')}
 grant select,insert,update on public.tbl_events to authenticated;grant usage on sequence public.tbl_events_id_seq to authenticated;
 alter table public.tbl_events enable row level security;
 create policy fixture_owner on public.tbl_events to authenticated using(created_by=public.current_app_user_id()) with check(created_by=public.current_app_user_id());
 `);
 sql(source('20261003211325_google_place_coordinate_retention.sql'));
 for(const role of ['anon','authenticated']){
  fail(()=>as(1,"select public.cache_google_place_coordinates('ChIJ_Test',1,2);",role),/permission denied/);
  fail(()=>as(1,'select * from private.google_place_coordinate_cache;',role),/permission denied/);
  fail(()=>as(1,'select private.purge_expired_google_coordinates();',role),/permission denied/);
 }
 eq(sql("select relrowsecurity from pg_class where oid='private.google_place_coordinate_cache'::regclass;"),'t');
 for(const args of [["'','1','2'"],["'space id ',1,2"],["'x','NaN',2"],["'x',1,'Infinity'"],["'x',91,2"],["'x',1,-181"],["null,1,2"],["'x',null,2"]])fail(()=>as(null,`select public.cache_google_place_coordinates(${args[0]});`,'service_role'),/Invalid Google/);
 const receipt=cache();eq(Object.keys(receipt).sort(),['expiresAt','latitude','longitude','placeId']);eq(receipt.latitude,12.3);eq(receipt.longitude,77.4);eq(receipt.placeId,'ChIJ_Test');
 eq(sql("select expires_at>now()+interval '27 days 23 hours' and expires_at<now()+interval '29 days' from private.google_place_coordinate_cache;"),'t');
 fail(()=>create(1,{location_source:'google',google_place_id:'Missing'}),/Refresh this Google venue/);
 fail(()=>create(1,{location_source:'google'}),/Google place ID/);
 const event=create(1,{location_source:'google',google_place_id:'ChIJ_Test',latitude:'bad client coordinate',longitude:'bad',location:'PROVIDER_ADDRESS_MUST_NOT_STORE',display_location:'GOOGLE_NAME_MUST_NOT_STORE',category:'Social',registration_questions:[{label:'Question'}]});
 eq(sql(`select location||'/'||display_location from public.tbl_events where id=${event};`),'Google Maps venue/Google Maps venue');
 eq(sql(`select latitude||'/'||longitude from public.tbl_events where id=${event};`),'12.3/77.4');
 eq(sql(`select location_coordinates_expires_at=(select expires_at from private.google_place_coordinate_cache where place_id='ChIJ_Test') from public.tbl_events where id=${event};`),'t');
 eq(sql('select count(*) from private.qa_questions;'),'1');eq(sql(`select count(*) from public.tbl_event_categories where event_id=${event};`),'1');
 fail(()=>update(2,event,{title:'Cross-user'}),/not manageable/);
 eq(as(2,`select count(*) from public.tbl_events where id=${event};`),'0');
 eq(as(1,`update public.tbl_events set latitude=89,longitude=179,location_coordinates_expires_at=now()+interval '99 days',location='injected' where id=${event} returning latitude||'/'||longitude;`),'12.3/77.4');
 eq(update(1,event,{title:'Other edit',category:'Social',latitude:'junk',longitude:'junk'}),event);
 eq(sql(`select count(*) from public.tbl_event_categories where event_id=${event};`),'1');
 fail(()=>update(1,event,{google_place_id:'Missing'}),/Refresh this Google venue/);
 eq(sql(`select google_place_id from public.tbl_events where id=${event};`),'ChIJ_Test');
 sql("update private.google_place_coordinate_cache set expires_at=now()-interval '1 second';");
 eq(update(1,event,{title:'Expired unrelated edit'}),event);
 eq(sql(`select latitude is null and longitude is null and google_place_id='ChIJ_Test' from public.tbl_events where id=${event};`),'t');
 fail(()=>create(1,{location_source:'google',google_place_id:'ChIJ_Test'}),/Refresh this Google venue/);
 cache('ChIJ_Test','13.4','78.5');eq(sql(`select latitude||'/'||longitude from public.tbl_events where id=${event};`),'13.4/78.5');
 const second=create(1,{location_source:'google',google_place_id:'ChIJ_Test'});
 eq(update(1,second,{location_source:'openstreetmap'}),second);eq(sql(`select google_place_id is null and location_coordinates_expires_at is null and latitude is null and longitude is null and location is null from public.tbl_events where id=${second};`),'t');
 eq(update(1,second,{location:'OSM venue',display_location:'OSM address',latitude:50,longitude:10}),second);
 eq(sql(`select latitude||'/'||longitude||'/'||location from public.tbl_events where id=${second};`),'50/10/OSM venue');
 const legacy=create(1,{location:'Old client venue',latitude:40,longitude:30});eq(sql(`select location_source||'/'||latitude from public.tbl_events where id=${legacy};`),'legacy/40');
 fail(()=>create(1,{location_source:'invented'}),/check constraint/);
 fail(()=>create(1,{location_source:'openstreetmap',latitude:91,longitude:0}),/Invalid latitude/);
 fail(()=>create(1,{location_source:'google',google_place_id:'ChIJ_Test',max_participants:0}),/Participant limit/);
 sql(`update public.tbl_events set status='completed' where id=${event};`);fail(()=>update(1,event,{title:'Ended edit'}),/has ended/);
 // Expiry clock is moved locally without altering real provider data. Bind makes
 // coordinates null on event edit; temporarily suspend only this test trigger to
 // represent stored coordinates waiting for the next hourly SQL cleanup.
 sql(`alter table public.tbl_events disable trigger a_google_activity_location_guard;update public.tbl_events set location_coordinates_expires_at=now()-interval '1 second' where id=${event};alter table public.tbl_events enable trigger a_google_activity_location_guard;update private.google_place_coordinate_cache set expires_at=now()-interval '1 second';`);
 const purged=JSON.parse(sql('select private.purge_expired_google_coordinates();'));eq(purged,{cacheRowsRemoved:1,eventRowsCleared:1});
 eq(sql(`select latitude is null and longitude is null and google_place_id='ChIJ_Test' from public.tbl_events where id=${event};`),'t');eq(sql('select count(*) from private.google_place_coordinate_cache;'),'0');eq(sql(`select latitude from public.tbl_events where id=${legacy};`),'40');eq(JSON.parse(sql('select private.purge_expired_google_coordinates();')),{cacheRowsRemoved:0,eventRowsCleared:0});
 cache('ChIJ_Test','14','79');eq(sql(`select latitude||'/'||longitude from public.tbl_events where id=${event};`),'14/79');
 sql("update auth.users set banned_until=now()+interval '1 day' where id='00000000-0000-0000-0000-000000000001';");fail(()=>create(1,{location_source:'google',google_place_id:'ChIJ_Test'}),/Account unavailable/);
 sql("update auth.users set banned_until=null;update public.tbl_users set deactivated_at=now() where id=1;");fail(()=>update(1,second,{title:'Blocked'}),/Account unavailable/);
 sql("update public.tbl_users set deactivated_at=null;delete from auth.users where id='00000000-0000-0000-0000-000000000001';");fail(()=>create(1,{}),/Account unavailable/);
 eq(sql("select count(*)||'/'||min(schedule) from cron.job where jobname='wenitro-google-coordinate-retention';"),'1/0 * * * *');
 eq(sql("select command from cron.job where jobname='wenitro-google-coordinate-retention';"),'select private.purge_expired_google_coordinates()');
 eq(sql("select count(*) from information_schema.columns where table_schema='private' and table_name='google_place_coordinate_cache' and column_name not in ('place_id','latitude','longitude','expires_at');"),'0');
 sql("insert into auth.users(id) values('00000000-0000-0000-0000-000000000119');insert into public.tbl_users(id,auth_user_id,fullname) values(119,'00000000-0000-0000-0000-000000000119','[QA] Local rollback host');");
 const productionVerifier=JSON.parse(sql("select set_config('qa.uid','',false);"+fs.readFileSync('scripts/qa-google-place-retention-rollback.sql','utf8')).split('\n').at(-1));
 eq(productionVerifier.status,'PASS_ROLLBACK_ONLY');eq(productionVerifier.checks.length,10);
 eq(sql("select count(*) from public.tbl_events where title='[QA] Google retention rollback only';"),'0');
 eq(sql("select count(*) from private.google_place_coordinate_cache where place_id like 'wenitro_qa_rollback_%';"),'0');
 console.log(JSON.stringify({status:'PASS',checks,scope:'Real PostgreSQL cache role/RLS boundary, trusted create/update receipt binding, anonymous/cross-user/disabled Auth denials, static labels, legacy/OSM compatibility, expired edit, trusted refresh, ended-event retention purge and idempotence. Cron scheduling contract uses local stub; no Google calls, no production mutation.'}));
}finally{if(started)run('pg_ctl',['-D',dir+'/db','-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
