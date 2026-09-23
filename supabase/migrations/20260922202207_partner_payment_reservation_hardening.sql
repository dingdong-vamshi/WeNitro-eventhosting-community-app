-- Close out-of-order races between user withdrawal, provider state updates,
-- expired orders, active seat reservations and late successful webhooks.

create or replace function private.get_my_partner_profile()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  me integer:=public.get_current_app_user_id();
  profile jsonb;
  payout jsonb;
begin
  if auth.uid() is null or me is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'user_id',p.user_id,
    'business_name',p.business_name,
    'description',p.description,
    'city',p.city,
    'activity_types',p.activity_types,
    'activity_location',p.activity_location,
    'age_category',p.age_category,
    'status',p.status,
    'submitted_at',p.submitted_at,
    'reviewed_at',p.reviewed_at,
    'decision_reason',p.decision_reason,
    'created_at',p.created_at,
    'updated_at',p.updated_at
  ) into profile
  from public.tbl_partner_profiles p where p.user_id=me;
  select jsonb_build_object(
    'bank_name',a.bank_name,
    'account_holder_name',a.account_holder_name,
    'account_number_masked',private.mask_financial_value(a.account_number,4),
    'ifsc_masked',private.mask_financial_value(a.ifsc,4),
    'upi_id_masked',case when a.upi_id='' then ''
      when position('@' in a.upi_id)>0
        then left(a.upi_id,1)||'•••@'||split_part(a.upi_id,'@',2)
      else private.mask_financial_value(a.upi_id,3) end,
    'review_status',a.review_status,
    'review_reason',a.review_reason,
    'updated_at',a.updated_at
  ) into payout
  from public.tbl_partner_payout_accounts a where a.user_id=me;
  return jsonb_build_object(
    'profile',profile,
    'payout_account',payout,
    'eligible',private.partner_eligible(me),
    'can_host_paid',private.has_active_partner(me)
  );
end $$;

drop policy if exists partner_application_history_owner_read
on public.tbl_partner_application_history;
revoke select on public.tbl_partner_application_history from authenticated;

create or replace function private.release_unpaid_activity_reservation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='left' and old.status='payment_required' then
    update public.tbl_activity_payments set
      status='cancelled',
      provider_status='USER_WITHDREW',
      provider_metadata=coalesce(provider_metadata,'{}'::jsonb)
        ||jsonb_build_object('local_cancellation_reason','USER_WITHDREW'),
      updated_at=now()
    where event_id=new.event_id and user_id=new.user_id
      and status in ('created','pending');
  end if;
  return new;
end $$;

drop trigger if exists release_unpaid_activity_reservation
on public.tbl_event_participants;
create trigger release_unpaid_activity_reservation
before update of status on public.tbl_event_participants
for each row execute function private.release_unpaid_activity_reservation();

create or replace function public.record_activity_payment_provider_state(
  p_order_id text,p_status text,p_provider_status text,
  p_provider_payment_id text default null,p_provider_metadata jsonb default '{}'::jsonb
) returns public.tbl_activity_payments language plpgsql security definer set search_path='' as $$
declare
  normalized_status text;
  payment public.tbl_activity_payments;
begin
  normalized_status:=case
    when p_status in ('created','pending','failed','cancelled','expired') then p_status
    else 'pending' end;
  select * into payment from public.tbl_activity_payments
  where provider_order_id=p_order_id for update;
  if payment.id is null then raise exception 'Payment order not found'; end if;
  -- Verified payments and explicit local withdrawals are terminal for
  -- non-success provider events. A later SUCCESS still goes through the
  -- finalizer, which preserves evidence and opens a refund-required case.
  if payment.status='paid'
     or (payment.status='cancelled' and payment.provider_status='USER_WITHDREW') then
    return payment;
  end if;
  update public.tbl_activity_payments set
    status=normalized_status,
    provider_status=nullif(p_provider_status,''),
    provider_payment_id=coalesce(nullif(p_provider_payment_id,''),provider_payment_id),
    provider_metadata=coalesce(provider_metadata,'{}'::jsonb)
      ||coalesce(p_provider_metadata,'{}'::jsonb),
    last_verified_at=now(),updated_at=now()
  where id=payment.id returning * into payment;
  return payment;
end $$;

create or replace function public.finalize_activity_payment(
  p_order_id text,p_provider_payment_id text,p_amount_paisa bigint,p_currency text,
  p_provider_status text,p_provider_metadata jsonb default '{}'::jsonb
) returns public.tbl_activity_payments language plpgsql security definer set search_path='' as $$
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
end $$;

revoke all on function private.release_unpaid_activity_reservation()
  ,private.get_my_partner_profile()
from public,anon,authenticated;
revoke all on function public.record_activity_payment_provider_state(text,text,text,text,jsonb),
  public.finalize_activity_payment(text,text,bigint,text,text,jsonb)
from public,anon,authenticated;
grant execute on function public.record_activity_payment_provider_state(text,text,text,text,jsonb),
  public.finalize_activity_payment(text,text,bigint,text,text,jsonb)
to service_role;
