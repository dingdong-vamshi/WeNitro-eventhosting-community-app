-- Retrying Join is not leaving/rejoining. Preserve current authorization and
-- verified paid admission after all existing auth/lifecycle/form checks.
do $$ declare definition text; begin
 select pg_get_functiondef('public.request_join_activity(integer,text)'::regprocedure) into definition;
 if position('  occupied:=private.activity_occupied_count(p_event_id,me);' in definition)=0 then raise exception 'Unexpected join capacity contract';end if;
 definition:=replace(definition,'  occupied:=private.activity_occupied_count(p_event_id,me);',$guard$
  if existing.status in ('approved','going','paid','payment_required','payment_pending','approved_pending_payment') then
    if exists(select 1 from public.tbl_activity_payments payment where payment.event_id=p_event_id and payment.user_id=me
      and payment.status='paid' and payment.financial_status in ('REFUND_REQUIRED','DISPUTED')) then
      raise exception 'Your previous payment needs review before joining again' using errcode='42501';
    end if;
    if existing.status in ('approved','going','paid') and event_row.is_paid and event_row.payment_collection_mode='cashfree'
      and not exists(select 1 from public.tbl_activity_payments payment where payment.event_id=p_event_id and payment.user_id=me
        and payment.status='paid' and payment.financial_status in ('PAYABLE','SETTLED','ON_HOLD')) then
      raise exception 'Verified payment is required for this registration' using errcode='42501';
    end if;
    return existing;
  end if;
  occupied:=private.activity_occupied_count(p_event_id,me);$guard$);
 execute definition;
end $$;
