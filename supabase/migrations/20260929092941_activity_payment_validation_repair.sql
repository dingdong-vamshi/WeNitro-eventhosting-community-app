-- Reject malformed prices before collection-mode normalization. Ordinary host
-- cost flags remain represented by costs_may_apply with is_paid=false/price=0;
-- approved Partner checkout remains represented by cashfree + a positive price.
create or replace function private.enforce_partner_paid_hosting()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  if coalesce(new.price,0)<0 then
    raise exception 'Activity price cannot be negative' using errcode='22023';
  end if;

  if coalesce(new.is_paid,false) or coalesce(new.price,0)>0 then
    if coalesce(new.price,0)<=0 then
      raise exception 'Paid activities require a positive price' using errcode='22023';
    end if;
    new.is_paid:=true;
    if tg_op='UPDATE' and old.is_paid and old.created_by=new.created_by then
      -- Publication fixes the meaning of an existing paid listing. Partner
      -- approval later must not silently turn an onsite activity into checkout.
      if new.payment_collection_mode is distinct from old.payment_collection_mode then
        raise exception 'Collection mode cannot change after a paid activity is created'
          using errcode='42501';
      end if;
      if old.payment_collection_mode='cashfree'
         and not private.has_active_partner(new.created_by) then
        raise exception 'Platform paid hosting requires an approved Partner'
          using errcode='42501';
      end if;
      new.payment_collection_mode:=old.payment_collection_mode;
    else
      new.payment_collection_mode:=case
        when private.has_active_partner(new.created_by) then 'cashfree'
        else 'onsite'
      end;
    end if;
  else
    new.is_paid:=false;
    new.price:=0;
    new.payment_collection_mode:='onsite';
  end if;
  return new;
end
$$;

revoke all on function private.enforce_partner_paid_hosting()
  from public,anon,authenticated;

notify pgrst,'reload schema';
