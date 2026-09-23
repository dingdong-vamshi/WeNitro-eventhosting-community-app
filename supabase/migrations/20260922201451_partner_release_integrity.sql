-- Final Partner release integrity pass.
--
-- 1. Payout destinations are exactly one of a complete bank account or UPI ID.
-- 2. Public RPCs keep private helpers private while remaining callable.
-- 3. Operational Admin identities do not require consumer tbl_users rows.
-- 4. PAID settlements are terminal and payment state cannot diverge.
-- 5. Cashfree webhook retries can atomically reclaim failed/stale deliveries.

alter table public.tbl_partner_payout_accounts
  drop constraint if exists partner_payout_bank_name_required,
  drop constraint if exists partner_payout_account_number_format,
  drop constraint if exists partner_payout_ifsc_format,
  drop constraint if exists partner_payout_upi_format,
  drop constraint if exists partner_payout_destination_valid;

alter table public.tbl_partner_payout_accounts
  add constraint partner_payout_destination_valid check (
    (
      char_length(btrim(bank_name)) between 2 and 120
      and char_length(btrim(account_holder_name)) between 2 and 160
      and account_number ~ '^[A-Za-z0-9]{6,34}$'
      and ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'
      and upi_id = ''
    )
    or
    (
      bank_name = ''
      and account_holder_name = ''
      and account_number = ''
      and ifsc = ''
      and upi_id ~ '^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,55}$'
    )
  );

comment on constraint partner_payout_destination_valid
  on public.tbl_partner_payout_accounts is
  'Exactly one complete payout method is required: bank account plus IFSC, or UPI.';

-- These wrappers intentionally use SECURITY DEFINER with an empty search_path.
-- Every private helper performs its own auth/role/ownership check, and the
-- private schema remains non-executable by browser roles.
alter function public.get_my_partner_profile() security definer;
alter function public.submit_partner_application(jsonb) security definer;
alter function public.save_my_partner_profile(text,text,text) security definer;
alter function public.get_partner_dashboard() security definer;
alter function public.get_partner_registrations(integer) security definer;
alter function public.get_partner_transactions(integer) security definer;
alter function public.admin_list_partner_applications(text) security definer;
alter function public.admin_search_partner_applications(text,text,text,timestamptz,timestamptz) security definer;
alter function public.admin_review_partner_application(integer,text,text) security definer;
alter function public.admin_list_partner_finance(text) security definer;
alter function public.admin_get_partner_finance_config() security definer;
alter function public.admin_update_partner_finance_config(integer,boolean,integer,text,integer,text) security definer;
alter function public.admin_update_partner_settlement(bigint,text,text,text) security definer;
alter function public.admin_record_partner_financial_event(bigint,text,text,bigint,text,text,text,jsonb) security definer;

create or replace function private.admin_review_partner_application(
  p_user_id integer,p_status text,p_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.current_app_user_id();
  auth_actor uuid:=auth.uid();
  target_status text:=upper(coalesce(p_status,''));
  previous_status text;
  profile public.tbl_partner_profiles;
begin
  if not public.is_wenitro_admin() or auth_actor is null then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if target_status not in ('APPROVED','REJECTED','SUSPENDED','UNDER_REVIEW') then
    raise exception 'Invalid Partner decision' using errcode='22023';
  end if;
  if target_status in ('REJECTED','SUSPENDED')
     and nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'A reason is required' using errcode='22023';
  end if;
  select status into previous_status
  from public.tbl_partner_profiles where user_id=p_user_id for update;
  if previous_status is null then raise exception 'Partner application not found'; end if;
  update public.tbl_partner_profiles set
    status=target_status,reviewed_at=now(),reviewed_by=me,
    reviewed_by_auth_user_id=auth_actor,
    decision_reason=nullif(btrim(coalesce(p_reason,'')),''),updated_at=now()
  where user_id=p_user_id returning * into profile;
  update public.tbl_partner_payout_accounts set
    review_status=case when target_status='APPROVED' then 'APPROVED'
      when target_status='SUSPENDED' then 'ON_HOLD'
      when target_status='REJECTED' then 'REJECTED' else 'UNDER_REVIEW' end,
    reviewed_at=now(),reviewed_by=me,reviewed_by_auth_user_id=auth_actor,
    review_reason=nullif(btrim(coalesce(p_reason,'')),''),updated_at=now()
  where user_id=p_user_id;
  insert into public.tbl_partner_application_history(
    user_id,from_status,to_status,reason,actor_user_id,actor_auth_user_id,snapshot
  ) values(
    p_user_id,previous_status,target_status,
    nullif(btrim(coalesce(p_reason,'')),''),me,auth_actor,to_jsonb(profile)
  );
  perform private.enqueue_notification(
    p_user_id,'partner_application_decision',
    case target_status when 'APPROVED' then 'Partner account approved'
      when 'REJECTED' then 'Partner application needs attention'
      when 'SUSPENDED' then 'Partner account suspended'
      else 'Partner application under review' end,
    coalesce(nullif(btrim(coalesce(p_reason,'')),''),
      case when target_status='APPROVED' then 'You can now host paid activities.'
      else 'Open your Partner profile for details.' end),
    p_user_id::text,me,
    jsonb_build_object('status',target_status,'reviewer_auth_user_id',auth_actor)
  );
  return to_jsonb(profile);
end $$;

create or replace function private.admin_update_partner_finance_config(
  p_platform_fee_bps integer,p_gst_enabled boolean,p_gst_bps integer,p_gst_basis text,
  p_settlement_days integer,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.current_app_user_id();
  auth_actor uuid:=auth.uid();
  result public.tbl_partner_finance_config;
begin
  if not private.is_finance_admin() or auth_actor is null then
    raise exception 'Finance admin access required' using errcode='42501';
  end if;
  if p_platform_fee_bps not between 0 and 10000 or p_settlement_days not between 0 and 90 then
    raise exception 'Invalid fee or settlement window' using errcode='22023';
  end if;
  if (not p_gst_enabled and (p_gst_bps<>0 or p_gst_basis<>'disabled'))
     or (p_gst_enabled and (p_gst_bps not between 1 and 10000
       or p_gst_basis not in ('gross','platform_fee'))) then
    raise exception 'GST rate and basis must be explicitly configured together' using errcode='22023';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'A configuration change reason is required';
  end if;
  update public.tbl_partner_finance_config set
    platform_fee_bps=p_platform_fee_bps,gst_enabled=p_gst_enabled,gst_bps=p_gst_bps,
    gst_basis=p_gst_basis,settlement_days=p_settlement_days,updated_at=now(),updated_by=me,
    updated_by_auth_user_id=auth_actor
  where singleton returning * into result;
  insert into public.tbl_partner_finance_config_history(
    platform_fee_bps,gst_enabled,gst_bps,gst_basis,settlement_days,
    changed_by,changed_by_auth_user_id,reason
  ) values(
    p_platform_fee_bps,p_gst_enabled,p_gst_bps,p_gst_basis,p_settlement_days,
    me,auth_actor,btrim(p_reason)
  );
  insert into public.tbl_partner_finance_audit(
    actor_user_id,actor_auth_user_id,action,entity_type,entity_id,after_data,reason
  ) values(
    me,auth_actor,'FINANCE_CONFIG_CHANGED','finance_config','singleton',
    to_jsonb(result),btrim(p_reason)
  );
  return to_jsonb(result);
end $$;

create or replace function private.enforce_settlement_release()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='PAID' and (
    new.status is distinct from old.status
    or new.paid_at is distinct from old.paid_at
    or new.payout_reference is distinct from old.payout_reference
  ) then
    raise exception 'Paid settlements are terminal; use an audited correction workflow';
  end if;
  if new.status='PAID' and old.status is distinct from 'PAID' then
    if old.status<>'PROCESSING' then
      raise exception 'A settlement must be processing before it can be marked paid';
    end if;
    if new.eligible_at is null or new.eligible_at>now() then
      raise exception 'Settlement is not eligible until the activity has ended';
    end if;
    if nullif(btrim(coalesce(new.payout_reference,'')),'') is null then
      raise exception 'A payout reference is required before marking paid';
    end if;
    if not exists(
      select 1 from public.tbl_partner_payout_accounts a
      where a.user_id=new.partner_user_id and a.review_status='APPROVED'
    ) then
      raise exception 'Approved payout details are required before settlement';
    end if;
    if exists(
      select 1 from public.tbl_partner_financial_events f
      where f.event_id=new.event_id
        and f.kind in ('REFUND','CHARGEBACK','DISPUTE','REVERSAL')
        and f.status in ('REQUIRED','PENDING','PROCESSING','OPEN')
    ) then
      raise exception 'Settlement has an unresolved refund or dispute';
    end if;
    if exists(
      select 1 from public.tbl_activity_payments p
      where p.event_id=new.event_id and p.status='paid'
        and p.financial_status<>'PAYABLE'
    ) then
      raise exception 'All verified payments must be payable before settlement';
    end if;
  end if;
  return new;
end $$;

create or replace function private.admin_update_partner_settlement(
  p_settlement_id bigint,p_status text,p_payout_reference text default null,p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.current_app_user_id();
  auth_actor uuid:=auth.uid();
  before_row public.tbl_partner_settlements;
  after_row public.tbl_partner_settlements;
  target text:=upper(coalesce(p_status,''));
  payout_ref text:=nullif(btrim(coalesce(p_payout_reference,'')),'');
begin
  if not private.is_finance_admin() or auth_actor is null then
    raise exception 'Finance admin access required' using errcode='42501';
  end if;
  if target not in ('PENDING','PROCESSING','PAID','FAILED','ON_HOLD') then
    raise exception 'Invalid settlement status' using errcode='22023';
  end if;
  select * into before_row
  from public.tbl_partner_settlements where id=p_settlement_id for update;
  if before_row.id is null then raise exception 'Settlement not found'; end if;
  if before_row.status='PAID' then
    if target<>'PAID' or (payout_ref is not null and payout_ref is distinct from before_row.payout_reference) then
      raise exception 'Paid settlements are terminal; use an audited correction workflow';
    end if;
    return to_jsonb(before_row);
  end if;
  if target is distinct from before_row.status and not (
    (before_row.status='PENDING' and target in ('PROCESSING','FAILED','ON_HOLD'))
    or (before_row.status='PROCESSING' and target in ('PAID','FAILED','ON_HOLD'))
    or (before_row.status='FAILED' and target in ('PROCESSING','ON_HOLD'))
    or (before_row.status='ON_HOLD' and target in ('PROCESSING','FAILED'))
  ) then
    raise exception 'Invalid settlement status transition from % to %',before_row.status,target
      using errcode='22023';
  end if;
  if target='PAID' and payout_ref is null then
    raise exception 'A payout reference is required before marking paid';
  end if;
  update public.tbl_partner_settlements set
    status=target,
    payout_reference=case when target='PAID' then payout_ref else null end,
    note=nullif(btrim(coalesce(p_note,'')),''),
    paid_at=case when target='PAID' then now() else null end,
    updated_by=me,updated_by_auth_user_id=auth_actor,updated_at=now()
  where id=p_settlement_id returning * into after_row;
  if target='PAID' then
    update public.tbl_activity_payments set financial_status='SETTLED'
    where event_id=after_row.event_id and status='paid' and financial_status='PAYABLE';
  end if;
  insert into public.tbl_partner_finance_audit(
    actor_user_id,actor_auth_user_id,action,entity_type,entity_id,
    before_data,after_data,reason
  ) values(
    me,auth_actor,'SETTLEMENT_STATUS_CHANGED','settlement',p_settlement_id::text,
    to_jsonb(before_row),to_jsonb(after_row),p_note
  );
  perform private.enqueue_notification(
    after_row.partner_user_id,'partner_settlement_update','Settlement updated',
    'Settlement status: '||target,after_row.event_id::text,me,
    jsonb_build_object('settlement_id',after_row.id,'status',target)
  );
  return to_jsonb(after_row);
end $$;

create or replace function private.admin_record_partner_financial_event(
  p_payment_id bigint,p_kind text,p_status text,p_amount_paisa bigint,
  p_provider_reference text,p_idempotency_key text,p_reason text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.current_app_user_id();
  auth_actor uuid:=auth.uid();
  payment public.tbl_activity_payments;
  event_row public.tbl_events;
  result public.tbl_partner_financial_events;
  normalized_kind text:=upper(coalesce(p_kind,''));
  normalized_status text:=upper(coalesce(p_status,''));
  successful_refunds bigint:=0;
begin
  if not private.is_finance_admin() or auth_actor is null then
    raise exception 'Finance admin access required' using errcode='42501';
  end if;
  if normalized_kind not in ('REFUND','CHARGEBACK','DISPUTE','REVERSAL','ADJUSTMENT')
     or normalized_status not in ('REQUIRED','PENDING','PROCESSING','SUCCEEDED','FAILED','OPEN','RESOLVED') then
    raise exception 'Invalid financial event kind or status' using errcode='22023';
  end if;
  if p_amount_paisa<0 or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
     or nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Amount, idempotency key and reason are required' using errcode='22023';
  end if;
  select * into payment
  from public.tbl_activity_payments where id=p_payment_id and status='paid' for update;
  if payment.id is null then raise exception 'Verified payment not found'; end if;
  if payment.financial_status='SETTLED' then
    raise exception 'Settled payments require an audited correction workflow' using errcode='22023';
  end if;
  select * into event_row from public.tbl_events where id=payment.event_id;
  if normalized_kind='REFUND' and normalized_status='SUCCEEDED' then
    select coalesce(sum(amount_paisa),0) into successful_refunds
    from public.tbl_partner_financial_events
    where payment_id=payment.id and kind='REFUND' and status='SUCCEEDED';
    if successful_refunds+p_amount_paisa>payment.amount_paisa then
      raise exception 'Refund total exceeds verified payment';
    end if;
  end if;
  insert into public.tbl_partner_financial_events(
    payment_id,event_id,partner_user_id,participant_user_id,kind,status,amount_paisa,
    provider_reference,idempotency_key,reason,metadata,created_by,created_by_auth_user_id
  ) values(
    payment.id,payment.event_id,event_row.created_by,payment.user_id,
    normalized_kind,normalized_status,p_amount_paisa,
    nullif(btrim(coalesce(p_provider_reference,'')),''),btrim(p_idempotency_key),
    btrim(p_reason),coalesce(p_metadata,'{}'::jsonb),me,auth_actor
  ) returning * into result;
  update public.tbl_activity_payments set financial_status=case
    when normalized_kind='REFUND' and normalized_status='SUCCEEDED'
      and successful_refunds+p_amount_paisa>=amount_paisa then 'REFUNDED'
    when normalized_kind in ('CHARGEBACK','REVERSAL') and normalized_status='SUCCEEDED' then 'REVERSED'
    when normalized_kind='DISPUTE' and normalized_status in ('OPEN','PENDING','PROCESSING') then 'DISPUTED'
    when normalized_status in ('REQUIRED','PENDING','PROCESSING','OPEN') then 'ON_HOLD'
    else financial_status end
  where id=payment.id;
  perform private.refresh_partner_settlement(payment.event_id);
  insert into public.tbl_partner_finance_audit(
    actor_user_id,actor_auth_user_id,action,entity_type,entity_id,after_data,reason
  ) values(
    me,auth_actor,'FINANCIAL_EVENT_RECORDED','financial_event',result.id::text,
    to_jsonb(result),p_reason
  );
  perform private.enqueue_notification(
    payment.user_id,'payment_financial_update','Payment update',
    initcap(lower(normalized_kind))||' status: '||normalized_status,
    payment.event_id::text,me,
    jsonb_build_object('financial_event_id',result.id,'kind',normalized_kind,'status',normalized_status)
  );
  return to_jsonb(result);
end $$;

create or replace function private.audit_partner_payout_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  actor integer:=public.current_app_user_id();
  auth_actor uuid:=auth.uid();
begin
  insert into public.tbl_partner_finance_audit(
    actor_user_id,actor_auth_user_id,action,entity_type,entity_id,
    before_data,after_data,reason
  ) values(
    actor,auth_actor,
    case when tg_op='INSERT' then 'PAYOUT_ACCOUNT_CREATED' else 'PAYOUT_ACCOUNT_CHANGED' end,
    'partner_payout_account',new.user_id::text,
    case when tg_op='INSERT' then null else jsonb_build_object(
      'bank_name',old.bank_name,
      'account_number_masked',private.mask_financial_value(old.account_number,4),
      'ifsc_masked',private.mask_financial_value(old.ifsc,4),
      'upi_id_masked',private.mask_financial_value(old.upi_id,4),
      'review_status',old.review_status) end,
    jsonb_build_object(
      'bank_name',new.bank_name,
      'account_number_masked',private.mask_financial_value(new.account_number,4),
      'ifsc_masked',private.mask_financial_value(new.ifsc,4),
      'upi_id_masked',private.mask_financial_value(new.upi_id,4),
      'review_status',new.review_status),
    case when tg_op='INSERT' then 'Partner payout destination submitted'
      else 'Partner payout destination updated and requires review' end
  );
  return new;
end $$;

create or replace function public.claim_cashfree_webhook_event(
  p_delivery_key text,p_event_type text,p_provider_order_id text,p_payload_hash text
) returns text language plpgsql security definer set search_path='' as $$
declare
  existing public.tbl_cashfree_webhook_events;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if nullif(btrim(coalesce(p_delivery_key,'')),'') is null
     or nullif(btrim(coalesce(p_payload_hash,'')),'') is null then
    raise exception 'Webhook delivery key and payload hash are required' using errcode='22023';
  end if;
  insert into public.tbl_cashfree_webhook_events(
    delivery_key,event_type,provider_order_id,payload_hash,status
  ) values(
    p_delivery_key,left(coalesce(p_event_type,'unknown'),160),
    nullif(btrim(coalesce(p_provider_order_id,'')),''),p_payload_hash,'RECEIVED'
  ) on conflict(delivery_key) do nothing;
  if found then return 'CLAIMED'; end if;

  select * into existing from public.tbl_cashfree_webhook_events
  where delivery_key=p_delivery_key for update;
  if existing.payload_hash is distinct from p_payload_hash then
    raise exception 'Webhook delivery key payload mismatch' using errcode='22023';
  end if;
  if existing.status in ('PROCESSED','IGNORED') then return 'TERMINAL'; end if;
  if existing.status='FAILED'
     or (existing.status='RECEIVED' and existing.received_at<now()-interval '5 minutes') then
    update public.tbl_cashfree_webhook_events set
      status='RECEIVED',error_message=null,processed_at=null,received_at=now()
    where delivery_key=p_delivery_key;
    return 'CLAIMED';
  end if;
  return 'IN_PROGRESS';
end $$;

revoke all on function public.claim_cashfree_webhook_event(text,text,text,text)
from public,anon,authenticated;
grant execute on function public.claim_cashfree_webhook_event(text,text,text,text)
to service_role;

revoke all on function private.admin_review_partner_application(integer,text,text),
  private.admin_update_partner_finance_config(integer,boolean,integer,text,integer,text),
  private.admin_update_partner_settlement(bigint,text,text,text),
  private.admin_record_partner_financial_event(bigint,text,text,bigint,text,text,text,jsonb),
  private.audit_partner_payout_change(),private.enforce_settlement_release()
from public,anon,authenticated;

-- A paid seat is reserved only while its Cashfree order is active. An unpaid
-- approval alone never blocks capacity indefinitely; checkout expires after
-- the server-authored window and the participant may retry or withdraw.
create or replace function private.activity_occupied_count(
  p_event_id integer,p_exclude_user_id integer default null
) returns integer language sql stable security definer set search_path='' as $$
  select count(*)::integer
  from public.tbl_event_participants participant
  where participant.event_id=p_event_id
    and (p_exclude_user_id is null or participant.user_id<>p_exclude_user_id)
    and (
      participant.status in ('approved','going')
      or (
        participant.status='payment_required'
        and exists(
          select 1 from public.tbl_activity_payments payment
          where payment.event_id=participant.event_id
            and payment.user_id=participant.user_id
            and payment.status in ('created','pending')
            and payment.checkout_expires_at>now()
        )
      )
    )
$$;

create or replace function public.request_join_activity(
  p_event_id integer,p_status text default 'going'
) returns public.tbl_event_participants language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.get_current_app_user_id();
  event_row public.tbl_events;
  existing public.tbl_event_participants;
  db_status text;
  result_row public.tbl_event_participants;
  occupied integer;
begin
  if auth.uid() is null or me is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select * into event_row from public.tbl_events where id=p_event_id for update;
  if event_row.id is null then raise exception 'Activity is unavailable'; end if;
  select * into existing from public.tbl_event_participants
  where event_id=p_event_id and user_id=me for update;

  if p_status in ('left','declined') then
    if existing.id is null then raise exception 'No participation exists to leave'; end if;
    update public.tbl_event_participants
    set status='left',responded_at=now(),joined_at=null
    where id=existing.id returning * into result_row;
    update public.tbl_activity_payments
    set status='cancelled',provider_status=coalesce(provider_status,'USER_WITHDREW'),updated_at=now()
    where event_id=p_event_id and user_id=me
      and status in ('created','pending') and checkout_expires_at>now();
    return result_row;
  end if;

  if p_status not in ('going','interested','waitlist') then
    raise exception 'Invalid participation status';
  end if;
  if event_row.status<>'published' or coalesce(event_row.is_deleted,false)
     or coalesce(event_row.is_cancelled,false) then
    raise exception 'Activity is unavailable';
  end if;
  if event_row.visibility_type<>'public' and existing.id is null then
    raise exception 'Use a valid invitation to join this private activity' using errcode='42501';
  end if;
  if event_row.created_by=me then raise exception 'Hosts cannot join their own activity'; end if;
  if event_row.registration_close_time is not null
     and event_row.registration_close_time<now() then
    raise exception 'Registration is closed';
  end if;
  perform private.assert_registration_complete(p_event_id,me);
  occupied:=private.activity_occupied_count(p_event_id,me);
  db_status:=case
    when p_status in ('interested','waitlist') then 'pending'
    when event_row.max_participants is not null and occupied>=event_row.max_participants then 'pending'
    when event_row.join_type='approval' then 'pending'
    when event_row.is_paid then 'payment_required'
    else 'approved' end;
  insert into public.tbl_event_participants(event_id,user_id,status,responded_at,joined_at)
  values(
    p_event_id,me,db_status,
    case when db_status='approved' then now() end,
    case when db_status='approved' then now() end
  )
  on conflict(event_id,user_id) do update set
    status=excluded.status,responded_at=excluded.responded_at,joined_at=excluded.joined_at
  returning * into result_row;
  return result_row;
end $$;

create or replace function public.respond_activity_join(
  p_event_id integer,p_user_id integer,p_status text
) returns public.tbl_event_participants language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.get_current_app_user_id();
  event_row public.tbl_events;
  normalized_status text;
  result_row public.tbl_event_participants;
  occupied integer;
begin
  if auth.uid() is null or me is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select * into event_row from public.tbl_events where id=p_event_id for update;
  if event_row.id is null or not private.can_manage_activity(p_event_id,me) then
    raise exception 'Only a host or co-host can respond' using errcode='42501';
  end if;
  if p_status not in ('approved','rejected','waitlist') then
    raise exception 'Invalid response';
  end if;
  normalized_status:=case
    when p_status='waitlist' then 'pending'
    when p_status='approved' and event_row.is_paid then 'payment_required'
    else p_status end;
  if normalized_status in ('approved','payment_required')
     and event_row.max_participants is not null then
    occupied:=private.activity_occupied_count(p_event_id,p_user_id);
    if occupied>=event_row.max_participants then raise exception 'Activity is full'; end if;
  end if;
  update public.tbl_event_participants set
    status=normalized_status,responded_at=now(),
    joined_at=case when normalized_status='approved' then coalesce(joined_at,now()) else null end
  where event_id=p_event_id and user_id=p_user_id returning * into result_row;
  if result_row.id is null then raise exception 'Join request not found'; end if;
  perform private.enqueue_notification(
    p_user_id,'activity_join_decision',
    case when normalized_status='payment_required' then 'Activity request approved — payment required'
      when normalized_status='approved' then 'Activity request approved'
      when normalized_status='rejected' then 'Activity request declined'
      else 'Activity request waitlisted' end,
    case when normalized_status='payment_required' then
      'Complete secure payment to confirm your place. A seat is reserved only while checkout is active.'
    else 'Your activity request status was updated.' end,
    p_event_id::text,me,jsonb_build_object('event_id',p_event_id,'status',normalized_status)
  );
  return result_row;
end $$;

create or replace function public.redeem_activity_invite(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.get_current_app_user_id();
  invite public.tbl_activity_invites;
  event_row public.tbl_events;
  participation public.tbl_event_participants;
  already_active boolean:=false;
  target_status text;
begin
  if auth.uid() is null or me is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_token !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Invite link is invalid'; end if;
  select * into invite from public.tbl_activity_invites
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if invite.id is null or invite.revoked_at is not null or invite.expires_at<=now()
     or (invite.max_uses is not null and invite.uses_count>=invite.max_uses) then
    raise exception 'Invite link is invalid or expired' using errcode='42501';
  end if;
  select * into event_row from public.tbl_events
  where id=invite.event_id and status='published' and not coalesce(is_deleted,false)
    and not coalesce(is_cancelled,false) for update;
  if event_row.id is null then raise exception 'Activity is unavailable'; end if;
  if event_row.created_by=me then
    return jsonb_build_object('event_id',event_row.id,'status','host');
  end if;
  if event_row.max_participants is not null
     and private.activity_occupied_count(event_row.id,me)>=event_row.max_participants then
    raise exception 'Activity is full';
  end if;
  select exists(
    select 1 from public.tbl_event_participants participant
    where participant.event_id=event_row.id and participant.user_id=me
      and participant.status in ('approved','going','payment_required')
  ) into already_active;
  target_status:=case when event_row.is_paid then 'payment_required' else 'approved' end;
  insert into public.tbl_event_participants(
    event_id,user_id,status,invited_by,responded_at,joined_at
  ) values(
    event_row.id,me,target_status,invite.created_by,now(),
    case when target_status='approved' then now() end
  )
  on conflict(event_id,user_id) do update set
    status=target_status,invited_by=invite.created_by,responded_at=now(),
    joined_at=case when target_status='approved'
      then coalesce(public.tbl_event_participants.joined_at,now()) else null end
  returning * into participation;
  if not already_active then
    update public.tbl_activity_invites set uses_count=uses_count+1 where id=invite.id;
  end if;
  return jsonb_build_object('event_id',event_row.id,'status',participation.status);
end $$;

create or replace function public.prepare_activity_payment(p_event_id integer)
returns public.tbl_activity_payments language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.get_current_app_user_id();
  event_row public.tbl_events;
  participation public.tbl_event_participants;
  payment public.tbl_activity_payments;
  amount_minor bigint;
  occupied integer;
  generated_order_id text;
begin
  if auth.uid() is null or me is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  select * into event_row from public.tbl_events
  where id=p_event_id and status='published' and not coalesce(is_deleted,false)
    and not coalesce(is_cancelled,false) for update;
  if event_row.id is null then raise exception 'Activity is unavailable'; end if;
  if not private.has_active_partner(event_row.created_by) then
    raise exception 'Paid checkout is unavailable while the Partner account is not approved'
      using errcode='42501';
  end if;
  if event_row.payment_collection_mode<>'cashfree' then
    raise exception 'Online checkout is unavailable';
  end if;
  perform private.assert_registration_complete(p_event_id,me);
  if event_row.created_by=me then raise exception 'Hosts cannot pay to join their own activity'; end if;
  if event_row.registration_close_time is not null
     and event_row.registration_close_time<now() then
    raise exception 'Registration is closed';
  end if;
  if not event_row.is_paid or event_row.price<=0 then
    raise exception 'This activity does not require payment';
  end if;
  if coalesce(event_row.currency,'INR')<>'INR' then
    raise exception 'Only INR activities are supported';
  end if;
  amount_minor:=round(event_row.price*100)::bigint;
  if amount_minor<=0 or abs(event_row.price*100-amount_minor)>0.000001 then
    raise exception 'Activity price must have at most two decimal places';
  end if;
  select * into participation from public.tbl_event_participants
  where event_id=p_event_id and user_id=me for update;
  if participation.status in ('approved','going') then
    raise exception 'You have already joined this activity';
  end if;
  if event_row.join_type='approval'
     and coalesce(participation.status,'')<>'payment_required' then
    raise exception 'Host approval is required before payment';
  end if;
  update public.tbl_activity_payments set
    status='expired',provider_status=coalesce(provider_status,'LOCAL_EXPIRED'),updated_at=now()
  where event_id=p_event_id and user_id=me
    and status in ('created','pending') and checkout_expires_at<=now();
  select * into payment from public.tbl_activity_payments
  where event_id=p_event_id and user_id=me
    and status in ('created','pending') and checkout_expires_at>now()
  order by created_at desc limit 1 for update;
  if payment.id is not null then
    if payment.amount_paisa<>amount_minor or payment.currency<>'INR' then
      raise exception 'The activity price changed; start a new payment attempt';
    end if;
    return payment;
  end if;
  occupied:=private.activity_occupied_count(p_event_id,me);
  if event_row.max_participants is not null and occupied>=event_row.max_participants then
    raise exception 'Activity is full';
  end if;
  if event_row.join_type<>'approval' then
    insert into public.tbl_event_participants(
      event_id,user_id,status,responded_at,joined_at
    ) values(p_event_id,me,'payment_required',now(),null)
    on conflict(event_id,user_id) do update set
      status=case when public.tbl_event_participants.status in ('approved','going')
        then public.tbl_event_participants.status else 'payment_required' end,
      responded_at=now(),joined_at=null;
  end if;
  generated_order_id:='wn_'||p_event_id::text||'_'||me::text||'_'
    ||substr(replace(gen_random_uuid()::text,'-',''),1,20);
  insert into public.tbl_activity_payments(
    event_id,user_id,partner_user_id,provider_order_id,
    amount_paisa,currency,status,checkout_expires_at
  ) values(
    p_event_id,me,event_row.created_by,generated_order_id,
    amount_minor,'INR','created',now()+interval '20 minutes'
  ) returning * into payment;
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
    select count(*) into occupied from public.tbl_event_participants
    where event_id=payment.event_id and user_id<>payment.user_id
      and status in ('approved','going');
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

revoke all on function private.activity_occupied_count(integer,integer)
from public,anon,authenticated;
