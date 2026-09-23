-- Provider-agnostic syntactic validation. This does not claim account ownership verification.

alter table public.tbl_partner_payout_accounts
  add constraint partner_payout_bank_name_required
    check(char_length(btrim(bank_name)) between 2 and 120),
  add constraint partner_payout_account_number_format
    check(account_number ~ '^[A-Za-z0-9]{6,34}$'),
  add constraint partner_payout_ifsc_format
    check(ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  add constraint partner_payout_upi_format
    check(upi_id ~ '^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,55}$');

comment on table public.tbl_partner_payout_accounts is
  'Restricted payout destination with syntactic validation only. Raw values are never returned by client RPCs. Ownership verification and external KMS/tokenisation remain operations integrations.';

create or replace function private.enforce_settlement_release()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='PAID' and old.status is distinct from 'PAID' then
    if new.eligible_at is null or new.eligible_at>now() then
      raise exception 'Settlement is not eligible until the activity has ended';
    end if;
    if nullif(btrim(coalesce(new.payout_reference,'')),'') is null then
      raise exception 'A payout reference is required before marking paid';
    end if;
    if not exists(
      select 1 from public.tbl_partner_payout_accounts a
      where a.user_id=new.partner_user_id and a.review_status='APPROVED'
    ) then raise exception 'Approved payout details are required before settlement'; end if;
    if exists(
      select 1 from public.tbl_partner_financial_events f
      where f.event_id=new.event_id
        and f.kind in ('REFUND','CHARGEBACK','DISPUTE','REVERSAL')
        and f.status in ('REQUIRED','PENDING','PROCESSING','OPEN')
    ) then raise exception 'Settlement has an unresolved refund or dispute'; end if;
  end if;
  return new;
end $$;

drop trigger if exists enforce_settlement_release on public.tbl_partner_settlements;
create trigger enforce_settlement_release
before update of status,payout_reference on public.tbl_partner_settlements
for each row execute function private.enforce_settlement_release();

revoke all on function private.enforce_settlement_release()
from public,anon,authenticated;
