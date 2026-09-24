-- Preserve the immutable terms behind every Cashfree checkout attempt.
-- Failed, expired and cancelled attempts remain audit evidence and can receive
-- delayed provider SUCCESS callbacks. Their terms must remain stable too.
-- In particular, paid -> free -> paid must not bypass collection-mode protection.
create or replace function private.freeze_activity_checkout_terms()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if row(new.is_paid, new.price, new.created_by, new.payment_collection_mode)
     is not distinct from
     row(old.is_paid, old.price, old.created_by, old.payment_collection_mode) then
    return new;
  end if;

  -- The UPDATE already locks the activity row. prepare_activity_payment locks
  -- that same row before inserting an attempt; no extra payment-row locks are
  -- needed here (the finalizer takes payment -> activity locks).
  if exists (
    select 1 from public.tbl_activity_payments payment
    where payment.event_id = old.id
      and payment.provider = 'cashfree'
  ) then
    raise exception 'Activity payment terms cannot change after a Cashfree checkout attempt'
      using errcode = '42501',
        hint = 'Keep the existing price, host and collection mode. Publish a new activity if different payment terms are needed.';
  end if;
  return new;
end $$;

revoke all on function private.freeze_activity_checkout_terms() from public, anon, authenticated;

-- Alphabetical BEFORE-trigger order intentionally runs this AFTER
-- enforce_partner_paid_hosting, so comparisons use server-normalized NEW terms.
create trigger freeze_activity_checkout_terms
before update on public.tbl_events
for each row execute function private.freeze_activity_checkout_terms();
