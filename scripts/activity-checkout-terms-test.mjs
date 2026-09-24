import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// An isolated, socket-only PostgreSQL fixture. Never reads production credentials.
// Requires locally installed initdb, pg_ctl and psql. Runs actual trigger SQL;
// other production auth/RLS/payment functions are intentionally not simulated.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wenitro-payment-guard-test-'));
const database = path.join(directory, 'database');
let started = false;
function run(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${command}: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout;
}
try {
  run('initdb', ['-D', database, '-A', 'trust', '--no-locale']);
  run('pg_ctl', ['-D', database, '-l', path.join(directory, 'postgres.log'), '-o', `-F -h '' -k ${directory} -p 55439`, '-w', 'start']);
  started = true;
  const modeMigration = fs.readFileSync('supabase/migrations/20260924083715_activity_dual_payment_modes.sql', 'utf8');
  const normalizer = modeMigration.slice(0, modeMigration.indexOf('do $$'));
  assert.ok(normalizer.includes('create or replace function private.enforce_partner_paid_hosting()'));
  const freezeMigration = fs.readFileSync('supabase/migrations/20260924085755_activity_checkout_terms_immutable.sql', 'utf8');
  const fixture = `
create role anon;
create role authenticated;
create schema private;
create table public.tbl_events (
  id integer primary key, is_paid boolean not null, price numeric not null,
  created_by integer not null, payment_collection_mode text not null,
  description text default ''
);
create table public.tbl_activity_payments (
  event_id integer not null references public.tbl_events(id),
  provider text not null default 'cashfree' check(provider='cashfree'),
  status text not null check(status in ('created','pending','paid','failed','cancelled','expired'))
);
create index on public.tbl_activity_payments(event_id);
-- Stand-in for approved capability only, not an auth/approval test.
create function private.has_active_partner(integer) returns boolean language sql as 'select $1=2';
${normalizer}
create trigger enforce_partner_paid_hosting before insert or update of is_paid,price,created_by,payment_collection_mode
on public.tbl_events for each row execute function private.enforce_partner_paid_hosting();
${freezeMigration}
insert into public.tbl_events(id,is_paid,price,created_by,payment_collection_mode) values
 (1,false,0,1,'cashfree'), (2,true,250,1,'cashfree'),
 (3,false,0,2,'cashfree'), (4,true,250,2,'onsite');
do $$
declare attempt_status text; modification text; blocked boolean; before_row public.tbl_events;
begin
  if exists(select 1 from public.tbl_events where id in (1,3) and (is_paid or price<>0 or payment_collection_mode<>'onsite')) then raise exception 'Free mode failed'; end if;
  if not exists(select 1 from public.tbl_events where id=2 and is_paid and payment_collection_mode='onsite') then raise exception 'Malicious ordinary cashfree request was not normalized'; end if;
  if not exists(select 1 from public.tbl_events where id=4 and is_paid and payment_collection_mode='cashfree') then raise exception 'Partner paid mode failed'; end if;
  update public.tbl_events set price=300 where id=2;
  update public.tbl_events set is_paid=false,price=0 where id=2;
  update public.tbl_events set is_paid=true,price=300 where id=2;
  if (select payment_collection_mode from public.tbl_events where id=2)<>'onsite' then raise exception 'Onsite no-payment edits changed mode'; end if;
  foreach attempt_status in array array['created','pending','paid','failed','cancelled','expired'] loop
    delete from public.tbl_activity_payments;
    insert into public.tbl_activity_payments(event_id,status) values(4,attempt_status);
    select * into before_row from public.tbl_events where id=4;
    foreach modification in array array[
      'is_paid=false,price=0', 'price=251', 'created_by=1', 'payment_collection_mode=''onsite'''
    ] loop
      blocked:=false;
      begin
        execute 'update public.tbl_events set '||modification||' where id=4';
      exception when sqlstate '42501' then blocked:=true;
      end;
      if not blocked then raise exception 'Payment terms bypass: status %, modification %',attempt_status,modification; end if;
    end loop;
    update public.tbl_events set description='Metadata remains editable',price=250 where id=4;
    if not exists(select 1 from public.tbl_events where id=4 and is_paid and price=250 and payment_collection_mode='cashfree' and created_by=2) then raise exception 'Blocked updates changed persisted terms'; end if;
  end loop;
  delete from public.tbl_activity_payments;
  update public.tbl_events set is_paid=false,price=0 where id=4;
  update public.tbl_events set is_paid=true,price=275 where id=4;
  if not exists(select 1 from public.tbl_events where id=4 and is_paid and price=275 and payment_collection_mode='cashfree') then raise exception 'No-payment free/paid edit failed'; end if;
end $$;
select 'PASS: four normalized modes, malicious requested modes, 24 blocked term/status transitions across all six attempt statuses, unchanged metadata, onsite edits, and no-attempt edits.';
`;
  const output = run('psql', ['-h', directory, '-p', '55439', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], fixture);
  console.log(output.trim());
  console.log('Actual trigger SQL executed only in an ephemeral local PostgreSQL fixture; no production mutation or payment provider calls.');
} finally {
  if (started) run('pg_ctl', ['-D', database, '-m', 'fast', '-w', 'stop']);
  // This exact fresh test directory contains only artifacts created above.
  fs.rmSync(directory, { recursive: true, force: true });
}
