import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wenitro-home-location-'));
const port = '55472';
const args = ['-h', directory, '-p', port, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
let started = false;
let checks = 0;
const run = (command, commandArgs, input) => {
  const result = spawnSync(command, commandArgs, { input, encoding: 'utf8', maxBuffer: 5e6 });
  if (result.error || result.status) throw Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout;
};
const sql = query => run('psql', args, query).trim();
const last = query => sql(query).split('\n').at(-1);
const equal = (actual, expected) => { assert.equal(actual, expected); checks += 1; };

try {
  run('initdb', ['-D', directory + '/db', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  run('pg_ctl', ['-D', directory + '/db', '-l', directory + '/log', '-o', '-F -h \'\' -k ' + directory + ' -p ' + port, '-w', 'start']);
  started = true;
  sql(`
    create role anon; create role authenticated;
    create schema private;
    create table public.tbl_events(
      id integer primary key, display_location text, location text, event_end_time timestamptz,
      is_deleted boolean default false, is_cancelled boolean default false
    );
    create table public.tbl_event_participants(
      id integer primary key, event_id integer, user_id integer, status text, role text,
      joined_at timestamp without time zone
    );
    create function public.get_current_app_user_id() returns integer language sql stable as
      $$ select nullif(current_setting('qa.user', true), '')::integer $$;
    ${fs.readFileSync('supabase/migrations/20261006170000_home_activity_location_fallback.sql', 'utf8')}
    insert into public.tbl_events(id,display_location,event_end_time) values
      (1,'Pune, Maharashtra, 411001, India',now()-interval '4 days'),
      (2,'Bengaluru, Bangalore North, Karnataka, 560001, India',now()-interval '2 days'),
      (3,'Mumbai, Maharashtra, India',now()-interval '1 day'),
      (4,'Bengaluru, Karnataka, India',now()+interval '1 day'),
      (5,'QA Test Location',now()-interval '2 hours'),
      (6,'Jaipur, Rajasthan, India',now()-interval '1 hour'),
      (7,'Kochi, Kerala, India',now()-interval '1 hour');
    update public.tbl_events set is_cancelled=true where id=6;
    insert into public.tbl_event_participants(id,event_id,user_id,status,role,joined_at) values
      (1,1,1,'approved','participant',now()-interval '4 days'),
      (2,2,1,'approved','participant',now()-interval '2 days'),
      (3,3,1,'pending','participant',now()-interval '1 day'),
      (4,4,1,'approved','participant',now()),
      (5,5,1,'approved','participant',now()),
      (6,6,1,'approved','participant',now()),
      (7,7,2,'approved','participant',now());
  `);

  equal(last("select set_config('qa.user','1',false);select public.home_location_fallback()->>'locality'"), 'Bengaluru');
  equal(last("select set_config('qa.user','2',false);select public.home_location_fallback()->>'locality'"), 'Kochi');
  equal(last("select set_config('qa.user','3',false);select public.home_location_fallback() is null"), 't');
  equal(sql("select private.activity_location_city('Wakad, Tathawade, Mulshi Subdistrict, Maharashtra, 411057, India')"), 'Tathawade');
  equal(sql("select private.activity_location_city('QA Test Location') is null"), 't');
  equal(sql("select has_function_privilege('anon','public.home_location_fallback()','EXECUTE')"), 'f');
  equal(sql("select has_function_privilege('authenticated','public.home_location_fallback()','EXECUTE')"), 't');
  equal(sql("select has_function_privilege('authenticated','private.activity_location_city(text)','EXECUTE')"), 'f');
  console.log(JSON.stringify({ status: 'PASS', checks, scope: 'current-user isolation, completed approved attendance, newest valid city, ignored pending/future/cancelled/unqualified locations, city-only parsing, and RPC grants' }));
} finally {
  if (started) run('pg_ctl', ['-D', directory + '/db', '-m', 'immediate', '-w', 'stop']);
  fs.rmSync(directory, { recursive: true, force: true });
}
