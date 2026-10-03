-- Existing service-only payment finalizer captured read-only 2026-10-03.
CREATE OR REPLACE FUNCTION public.finalize_activity_payment(p_order_id text, p_provider_payment_id text, p_amount_paisa bigint, p_currency text, p_provider_status text, p_provider_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS tbl_activity_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  payment public.tbl_activity_payments;
  event_row public.tbl_events;
  occupied integer;
  exception_reason text;
begin
  select * into payment from public.tbl_activity_payments
  where provider_order_id=p_order_id for update;
  if payment.id is null then raise exception 'Payment order not found'; end if;
  if payment.status='paid' then
    if payment.amount_paisa<>p_amount_paisa or payment.currency<>p_currency
       or coalesce(payment.provider_payment_id,'')<>
         coalesce(nullif(p_provider_payment_id,''),payment.provider_payment_id,'') then
      raise exception 'Conflicting paid-payment replay';
    end if;
    return payment;
  end if;
  if p_provider_status not in ('PAID','SUCCESS') then
    raise exception 'Provider has not confirmed payment';
  end if;
  if payment.amount_paisa<>p_amount_paisa or payment.currency<>p_currency then
    raise exception 'Provider payment amount does not match the server ledger';
  end if;
  if payment.status='cancelled' and payment.provider_status='USER_WITHDREW' then
    exception_reason:='PARTICIPANT_WITHDREW_AFTER_PAYMENT';
  end if;
  select * into event_row from public.tbl_events where id=payment.event_id for update;
  if exception_reason is null and (
    event_row.id is null or coalesce(event_row.is_deleted,false)
    or coalesce(event_row.is_cancelled,false)
  ) then
    exception_reason:='ACTIVITY_UNAVAILABLE_AFTER_PAYMENT';
  elsif exception_reason is null then
    occupied:=private.activity_occupied_count(payment.event_id,payment.user_id);
    if event_row.max_participants is not null and occupied>=event_row.max_participants then
      exception_reason:='CAPACITY_UNAVAILABLE_AFTER_PAYMENT';
    end if;
  end if;
  update public.tbl_activity_payments set
    status='paid',provider_status=p_provider_status,
    provider_payment_id=coalesce(nullif(p_provider_payment_id,''),provider_payment_id),
    provider_metadata=coalesce(provider_metadata,'{}'::jsonb)
      ||coalesce(p_provider_metadata,'{}'::jsonb),
    paid_at=coalesce(paid_at,now()),last_verified_at=now(),updated_at=now(),
    financial_status=case when exception_reason is null then 'PAYABLE' else 'REFUND_REQUIRED' end
  where id=payment.id returning * into payment;
  if exception_reason is null then
    insert into public.tbl_event_participants(
      event_id,user_id,status,responded_at,joined_at
    ) values(payment.event_id,payment.user_id,'approved',now(),now())
    on conflict(event_id,user_id) do update set
      status='approved',responded_at=now(),
      joined_at=coalesce(public.tbl_event_participants.joined_at,now());
    insert into public.tbl_partner_financial_events(
      payment_id,event_id,partner_user_id,participant_user_id,kind,status,
      amount_paisa,idempotency_key,provider_reference
    ) values(
      payment.id,payment.event_id,event_row.created_by,payment.user_id,
      'PAYMENT','SUCCEEDED',payment.amount_paisa,
      'payment:'||payment.id::text,payment.provider_payment_id
    ) on conflict(idempotency_key) do nothing;
    perform private.enqueue_notification(
      payment.user_id,'payment_confirmed','Payment confirmed',
      'Your payment is verified and your place is confirmed.',
      payment.event_id::text,null,jsonb_build_object('payment_id',payment.id)
    );
    perform private.refresh_partner_settlement(payment.event_id);
  else
    update public.tbl_event_participants
    set status='left',responded_at=now(),joined_at=null
    where event_id=payment.event_id and user_id=payment.user_id;
    perform private.queue_required_refund(payment,exception_reason);
  end if;
  return payment;
end $function$
;
