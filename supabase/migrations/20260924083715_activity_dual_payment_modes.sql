-- Existing is_paid + payment_collection_mode represent FREE, PAID/onsite,
-- and PAID/cashfree. The server chooses collection mode from approved status.
create or replace function private.enforce_partner_paid_hosting()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.is_paid,false) or coalesce(new.price,0)>0 then
    if coalesce(new.price,0)<=0 then raise exception 'Paid activities require a positive price'; end if;
    new.is_paid := true;
    if TG_OP='UPDATE' and old.is_paid and old.created_by=new.created_by then
      -- Approval after publication must not turn an on-site plan into checkout.
      if new.payment_collection_mode is distinct from old.payment_collection_mode then
        raise exception 'Collection mode cannot change after a paid activity is created' using errcode='42501';
      end if;
      if old.payment_collection_mode='cashfree' and not private.has_active_partner(new.created_by) then
        raise exception 'Platform paid hosting requires an approved Partner' using errcode='42501';
      end if;
      new.payment_collection_mode := old.payment_collection_mode;
    else
      new.payment_collection_mode := case when private.has_active_partner(new.created_by) then 'cashfree' else 'onsite' end;
    end if;
  else
    new.is_paid := false;
    new.price := 0;
    new.payment_collection_mode := 'onsite';
  end if;
  return new;
end $$;

-- Keep each existing function's privacy, capacity, approval, invitation and
-- registration guards intact; narrow its payment gate to platform collection.
-- Fail closed if deployed definitions drift from the inspected versions.
do $$
declare signature text; definition text; revised text;
begin
  foreach signature in array array[
    'public.request_join_activity(integer,text)',
    'public.respond_activity_join(integer,integer,text)',
    'public.redeem_activity_invite(text)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    revised := replace(definition, 'event_row.is_paid then', 'event_row.is_paid and event_row.payment_collection_mode=''cashfree'' then');
    if revised=definition then raise exception 'Expected payment gate not found in %',signature; end if;
    execute revised;
  end loop;
end $$;

comment on column public.tbl_events.payment_collection_mode is
  'Server-selected collection: onsite means direct host payment with normal joining; cashfree means approved Partner online payment before confirmation. is_paid=false means free.';
comment on column public.tbl_events.price is
  'Participation price in INR. Informational for onsite collection; server-authoritative checkout amount for Cashfree.';
