import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wenitro-hubble-credit-'));
let started = false;
let checks = 0;
const args = ['-h', dir, '-p', '55472', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
const run = (cmd, argv, input) => {
  const result = spawnSync(cmd, argv, { input, encoding: 'utf8', maxBuffer: 8e6 });
  if (result.error || result.status) throw Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout;
};
const sql = (query) => run('psql', args, query).trim();
const roleSql = (role, query, { admin = false, user = '' } = {}) => sql(`
  select set_config('qa.role','${role}',false);
  select set_config('qa.admin','${admin ? 'true' : 'false'}',false);
  select set_config('qa.uid','${user}',false);
  ${query}
`).split('\n').at(-1);
const service = (query) => roleSql('service_role', query);
const admin = (query) => roleSql('authenticated', query, { admin: true, user: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
const member = (query) => roleSql('authenticated', query, { user: '00000000-0000-4000-8000-000000000001' });
const json = (value) => JSON.parse(value);
const attempt = (runner, query) => runner(`select qa_attempt($qa$${query}$qa$)`);
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks += 1; };

try {
  run('initdb', ['-D', `${dir}/db`, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  run('pg_ctl', ['-D', `${dir}/db`, '-l', `${dir}/log`, '-o', `-F -h '' -k ${dir} -p 55472`, '-w', 'start']);
  started = true;
  sql(`
    create schema auth; create schema private; create schema vault;
    create role anon; create role authenticated; create role service_role;
    create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('qa.role',true),''),'anon')$$;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('qa.uid',true),'')::uuid$$;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,phone text,phone_confirmed_at timestamptz);
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create table public.tbl_users(id int primary key,auth_user_id uuid,points int,fullname text,is_active int default 1,is_delete int default 0,deactivated_at timestamptz);
    create table public.tbl_participant_ratings(id int primary key,event_id int);
    create table public.tbl_events(id int primary key,title text);
    create table public.tbl_referral_history(id serial primary key,referrer_id int,points_awarded int,created_at timestamptz default now());
    create table public.tbl_user_points_history(id serial primary key,user_id int references public.tbl_users,rating_id int,points_earned int,verification_method text,created_at timestamptz default now());
    alter table public.tbl_user_points_history add constraint verification_reward_valid check(verification_method is null or verification_method in('email','phone','live_photo'));
    create unique index verification_reward_once on public.tbl_user_points_history(user_id,verification_method) where verification_method is not null;
    create table public.tbl_hubble_transactions(id serial primary key,user_id int references public.tbl_users,reference_id varchar not null unique,coins numeric not null,transaction_type varchar not null,status varchar not null,note text,created_at timestamptz default now());
    alter table public.tbl_hubble_transactions enable row level security;
    create function public.is_wenitro_admin() returns bool language sql as $$select current_setting('qa.admin',true)='true'$$;
    create function public.get_current_app_user_id() returns int language sql as $$select nullif(current_setting('qa.user',true),'')::int$$;
    create function qa_attempt(q text) returns text language plpgsql as $$begin execute q;return 'ACCEPTED';exception when others then return sqlstate||':'||sqlerrm;end$$;
    insert into auth.users(id,email,email_confirmed_at) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin@example.test',now());
    insert into public.tbl_users(id,auth_user_id,points,fullname) select n,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,(array[0,70,150,199,200,401])[n],'User '||n from generate_series(1,6)n;
    insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) select auth_user_id,'u'||id||'@example.test',now(),'+91900000000'||id,now() from public.tbl_users;
    ${fs.readFileSync('supabase/migrations/20261006113000_hubble_nitro_redemption.sql','utf8')}
    ${fs.readFileSync('supabase/migrations/20261006121451_hubble_balance_eligibility.sql','utf8')}
    ${fs.readFileSync('supabase/migrations/20261006124557_hubble_staging_test_credit.sql','utf8')}
  `);

  eq(sql("select has_table_privilege('authenticated','public.tbl_hubble_staging_test_credits','INSERT')"), 'f');
  eq(sql("select has_table_privilege('authenticated','public.tbl_hubble_staging_test_credits','SELECT')"), 't');
  assert.match(attempt(member, "select public.admin_grant_hubble_staging_credit(1,200,'unauthorized try','10000000-0000-4000-8000-000000000001')"), /42501:WeNitro Admin access required/); checks += 1;
  assert.match(attempt(admin, "select public.admin_grant_hubble_staging_credit(1,300,'bad target','10000000-0000-4000-8000-000000000002')"), /22023:Target balance must be 200 or 500 Nitro/); checks += 1;

  const grant0 = json(admin("select public.admin_grant_hubble_staging_credit(1,200,'Hubble client staging test','10000000-0000-4000-8000-000000000010')"));
  eq(grant0.granted, 200); eq(grant0.currentBalance, 200);
  const grant70 = json(admin("select public.admin_grant_hubble_staging_credit(2,200,'Hubble client staging test','10000000-0000-4000-8000-000000000020')"));
  eq(grant70.granted, 130); eq(grant70.currentBalance, 200);
  const grant150 = json(admin("select public.admin_grant_hubble_staging_credit(3,200,'Hubble client staging test','10000000-0000-4000-8000-000000000030')"));
  eq(grant150.granted, 50); eq(grant150.currentBalance, 200);
  const grant199 = json(admin("select public.admin_grant_hubble_staging_credit(4,200,'Hubble client staging test','10000000-0000-4000-8000-000000000040')"));
  eq(grant199.granted, 1); eq(grant199.currentBalance, 200);
  const alreadyEligible = json(admin("select public.admin_grant_hubble_staging_credit(5,200,'Hubble client staging test','10000000-0000-4000-8000-000000000050')"));
  eq(alreadyEligible.granted, 0); eq(alreadyEligible.currentBalance, 200);
  eq(sql('select count(*) from public.tbl_hubble_staging_test_credits'), '4');
  eq(sql("select count(*) from public.tbl_user_points_history where verification_method like 'qa_credit:hubble_staging:%'"), '4');

  const duplicate = json(admin("select public.admin_grant_hubble_staging_credit(2,200,'retry with same key','10000000-0000-4000-8000-000000000020')"));
  eq(duplicate.idempotent, true); eq(duplicate.granted, 130); eq(sql('select points from public.tbl_users where id=2'), '200');

  const target500 = json(admin("select public.admin_grant_hubble_staging_credit(6,500,'Controlled multi-transaction staging','10000000-0000-4000-8000-000000000060')"));
  eq(target500.granted, 99); eq(target500.currentBalance, 500);
  const cleaned500 = json(admin(`select public.admin_reverse_hubble_staging_credit(${target500.creditId},'Staging test completed')`));
  eq(cleaned500.reversed, 99); eq(cleaned500.currentBalance, 401);
  const cleaned500Again = json(admin(`select public.admin_reverse_hubble_staging_credit(${target500.creditId},'Safe idempotent retry')`));
  eq(cleaned500Again.reversed, 0); eq(cleaned500Again.idempotent, true);

  const firstDebit = json(service("select public.hubble_debit(2,99,'credit-use-1','Staging redemption')"));
  eq(firstDebit.balance, 101);
  eq(sql(`select remaining_amount from public.tbl_hubble_staging_test_credits where id=${grant70.creditId}`), '31');
  eq(sql(`select status from public.tbl_hubble_staging_test_credits where id=${grant70.creditId}`), 'partially_used');
  const reversed = json(service("select public.hubble_reverse(2,'credit-use-1','Provider cancellation')"));
  eq(reversed.balance, 200);
  eq(sql(`select remaining_amount from public.tbl_hubble_staging_test_credits where id=${grant70.creditId}`), '130');
  eq(sql(`select reversed_amount from public.tbl_hubble_staging_credit_usage where debit_transaction_id=(select id from public.tbl_hubble_transactions where reference_id='credit-use-1' and transaction_type='debit')`), '99');

  const secondDebit = json(service("select public.hubble_debit(2,99,'credit-use-2','Successful staging redemption')"));
  eq(secondDebit.balance, 101);
  const cleanup = json(admin(`select public.admin_reverse_hubble_staging_credit(${grant70.creditId},'Client staging test completed')`));
  eq(cleanup.reversed, 31); eq(cleanup.currentBalance, 70);
  eq(sql('select points from public.tbl_users where id=2'), '70');
  eq(sql(`select status from public.tbl_hubble_staging_test_credits where id=${grant70.creditId}`), 'reversed');
  eq(sql("select count(*) from public.tbl_user_points_history where user_id=2 and verification_method like 'qa_credit_reversal:hubble_staging:%'"), '1');

  const listed = json(admin('select public.admin_list_hubble_staging_credits(2)'));
  eq(listed.currentBalance, 70); eq(listed.credits.length, 1); eq(listed.credits[0].status, 'reversed');
  eq(json(service('select public.hubble_get_balance(1)')).consumptionEligibility.allowed, true);
  eq(json(service('select public.hubble_get_balance(5)')).consumptionEligibility.allowed, true);
  eq(json(service('select public.hubble_get_balance(6)')).consumptionEligibility.allowed, true);

  console.log(JSON.stringify({ status: 'PASS', checks, scope: 'Admin-only exact staging credits for 0/70/150/199, no-op at 200, target 500, idempotent grant, Hubble allocation/reversal tracking, unused-credit cleanup, ledger audit, RLS and ordinary-user rejection' }));
} finally {
  if (started) run('pg_ctl', ['-D', `${dir}/db`, '-m', 'immediate', '-w', 'stop']);
  fs.rmSync(dir, { recursive: true, force: true });
}
