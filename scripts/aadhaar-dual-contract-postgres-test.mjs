import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wenitro-aadhaar-dual-'));
let started = false;
let checks = 0;
const run = (cmd, args, input) => {
  const result = spawnSync(cmd, args, { input, encoding: 'utf8', maxBuffer: 4e6 });
  if (result.error || result.status) throw Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout;
};
const sql = query => run('psql', ['-h', dir, '-p', '55465', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], query).trim();
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks += 1; };
const quote = value => value === null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
const actor1 = '00000000-0000-4000-8000-000000000001';
const actor2 = '00000000-0000-4000-8000-000000000002';
const transaction = '33333333-3333-4333-8333-333333333333';
const providerSession = '11111111-1111-4111-8111-111111111111';
const attempt = query => sql(`select qa_attempt(${quote(query)})`);
const otpCall = (actor, action, environment = null, id = null, reference = null, status = null, verified = false, last4 = null, error = null) =>
  `select public.aadhaar_otp_session_service(${quote(actor)},${quote(action)},${quote(environment)},${quote(id)},${quote(reference)},${quote(status)},${verified},${quote(transaction)},${quote(last4)},${quote(error)})`;
const sdkCall = (actor, action, environment = null, id = null, provider = null, status = null, verified = false) =>
  `select public.aadhaar_session_service(${quote(actor)},${quote(action)},${quote(environment)},${quote(id)},${quote(provider)},${quote(status)},${verified},${quote(transaction)})`;
const json = query => JSON.parse(sql(query) || 'null');
const trust = id => JSON.parse(sql(`select private.trust_score_for(${id})`));

try {
  run('initdb', ['-D', `${dir}/db`, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  run('pg_ctl', ['-D', `${dir}/db`, '-l', `${dir}/log`, '-o', `-F -h '' -k ${dir} -p 55465`, '-w', 'start']);
  started = true;
  sql(`
    create schema private; create schema auth; create schema vault;
    create role anon; create role authenticated; create role service_role;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('role',coalesce(nullif(current_setting('qa.role',true),''),'service_role'))$$;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,banned_until timestamptz);
    create table public.tbl_users(id int primary key,auth_user_id uuid,is_active int default 1,is_delete int default 0,deactivated_at timestamptz,rating numeric default 0,points int default 12,isverified int default 0);
    create table public.tbl_user_verification(user_id int unique,live_photo_verified bool default false,aadhaar_verified bool default false,phone_verified bool default false,status text,live_photo_path text,verification_type text,submitted_at timestamptz,reviewed_at timestamptz,updated_at timestamptz,aadhaar_number text,aadhaar_otp_code text,aadhaar_client_id text,aadhaar_otp_created_at timestamptz);
    create table public.tbl_user_social_links(user_id int,instagram text,facebook text,twitter text,linkedin text,youtube text);
    create table public.tbl_event_participants(event_id int,user_id int,status text);
    create table public.tbl_events(id int primary key,is_deleted bool default false,is_cancelled bool default false);
    create function public.get_current_app_user_id() returns int language sql as $$select 1$$;
    create function private.can_read_profile(int) returns bool language sql as $$select $1=1$$;
    create function qa_attempt(q text) returns text language plpgsql as $$begin execute q;return 'ACCEPTED';exception when others then return SQLSTATE;end$$;
    insert into public.tbl_users(id,auth_user_id) values(1,'${actor1}'),(2,'${actor2}');
    insert into auth.users(id) select auth_user_id from public.tbl_users;
    ${fs.readFileSync('scripts/fixtures/trust-score-functions.sql', 'utf8')}
    ${fs.readFileSync('supabase/migrations/20261003205431_sandbox_digilocker_verification.sql', 'utf8')}
    ${fs.readFileSync('supabase/migrations/20261005120000_aadhaar_otp_verification.sql', 'utf8')}
    ${fs.readFileSync('supabase/migrations/20261005143000_restore_digilocker_sdk_contract.sql', 'utf8')}
    ${fs.readFileSync('supabase/migrations/20261006060000_support_both_aadhaar_client_contracts.sql', 'utf8')}
  `);

  eq(sql("select relrowsecurity from pg_class where oid='private.aadhaar_verification_sessions'::regclass"), 't');
  for (const role of ['anon', 'authenticated']) {
    eq(sql(`select has_table_privilege('${role}','private.aadhaar_verification_sessions','SELECT')`), 'f');
    eq(sql(`select has_function_privilege('${role}','public.aadhaar_otp_session_service(uuid,text,text,uuid,text,text,boolean,uuid,text,text)','EXECUTE')`), 'f');
    eq(sql(`select has_function_privilege('${role}','public.aadhaar_session_service(uuid,text,text,uuid,uuid,text,boolean,uuid)','EXECUTE')`), 'f');
  }
  eq(sql("select has_function_privilege('service_role','public.aadhaar_otp_session_service(uuid,text,text,uuid,text,text,boolean,uuid,text,text)','EXECUTE')"), 't');
  eq(sql("select has_function_privilege('service_role','public.aadhaar_session_service(uuid,text,text,uuid,uuid,text,boolean,uuid)','EXECUTE')"), 't');
  eq(sql(`select set_config('qa.role','authenticated',false);select qa_attempt(${quote(otpCall(actor1, 'begin', 'production', null, null, null, false, '9012'))})`).split('\n').at(-1), '42501');

  const otp = json(otpCall(actor1, 'begin', 'production', null, null, null, false, '9012'));
  eq(otp.user_id, 1);
  eq(otp.consent_version, 'wenitro-aadhaar-okyc-v1');
  eq(attempt(otpCall(actor2, 'update', 'production', otp.id, '1234567', 'otp_sent')), '42501');
  eq(json(otpCall(actor1, 'update', 'production', otp.id, '1234567', 'otp_sent')).status, 'otp_sent');
  const otpVerified = json(otpCall(actor1, 'update', 'production', otp.id, '1234567', 'succeeded', true));
  assert(otpVerified.verified_at); checks += 1;
  eq(trust(1).total, 20);
  eq(sql('select points from public.tbl_users where id=1'), '12');
  eq(sql('select count(*) from public.tbl_user_verification where user_id=1 and aadhaar_verified and status=\'approved\''), '1');
  eq(json(otpCall(actor1, 'update', 'production', otp.id, '1234567', 'succeeded', true)).verified_at, otpVerified.verified_at);
  eq(trust(1).total, 20);

  const sdk = json(sdkCall(actor2, 'begin', 'production'));
  eq(sdk.user_id, 2);
  eq(sdk.consent_version, 'wenitro-aadhaar-digilocker-sdk-v1');
  eq(json(sdkCall(actor2, 'update', 'production', sdk.id, providerSession, 'created')).status, 'created');
  const sdkVerified = json(sdkCall(actor2, 'update', 'production', sdk.id, providerSession, 'succeeded', true));
  assert(sdkVerified.verified_at); checks += 1;
  eq(trust(2).total, 20);
  eq(sql("select count(*) from information_schema.columns where table_schema='private' and table_name='aadhaar_verification_sessions' and column_name in ('aadhaar_number','aadhaar_otp','photo','document','document_url','name','address')"), '0');

  console.log(JSON.stringify({
    status: 'PASS',
    checks,
    scope: 'Real PostgreSQL dual Aadhaar ledgers: service-only RLS boundary, on-demand session initialization, cross-user denial, legacy OTP and current DigiLocker provider evidence, +20 Trust exactly once, zero Nitro mutation, and no full Aadhaar/OTP/demographic storage.',
  }));
} finally {
  if (started) run('pg_ctl', ['-D', `${dir}/db`, '-m', 'immediate', '-w', 'stop']);
  fs.rmSync(dir, { recursive: true, force: true });
}
