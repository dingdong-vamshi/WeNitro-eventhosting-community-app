-- Admins may be operational Auth identities without consumer tbl_users rows.
-- Preserve both optional app-user attribution and authoritative Auth UUID attribution.

alter table public.tbl_partner_profiles
  add column if not exists reviewed_by_auth_user_id uuid references auth.users(id) on delete set null;
alter table public.tbl_partner_application_history
  add column if not exists actor_auth_user_id uuid references auth.users(id) on delete set null;
alter table public.tbl_partner_payout_accounts
  add column if not exists reviewed_by_auth_user_id uuid references auth.users(id) on delete set null;
alter table public.tbl_partner_finance_config
  add column if not exists updated_by_auth_user_id uuid references auth.users(id) on delete set null;
alter table public.tbl_partner_finance_config_history
  add column if not exists changed_by_auth_user_id uuid references auth.users(id) on delete set null;
alter table public.tbl_partner_financial_events
  add column if not exists created_by_auth_user_id uuid references auth.users(id) on delete set null;
alter table public.tbl_partner_settlements
  add column if not exists updated_by_auth_user_id uuid references auth.users(id) on delete set null;
alter table public.tbl_partner_finance_audit
  add column if not exists actor_auth_user_id uuid references auth.users(id) on delete set null;

create or replace function private.admin_review_partner_application(
  p_user_id integer,p_status text,p_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.get_current_app_user_id(); auth_actor uuid:=auth.uid();
  target_status text:=upper(coalesce(p_status,'')); previous_status text;
  profile public.tbl_partner_profiles;
begin
  if not public.is_wenitro_admin() or auth_actor is null then raise exception 'Admin access required' using errcode='42501'; end if;
  if target_status not in ('APPROVED','REJECTED','SUSPENDED','UNDER_REVIEW') then raise exception 'Invalid Partner decision' using errcode='22023'; end if;
  if target_status in ('REJECTED','SUSPENDED') and nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'A reason is required' using errcode='22023'; end if;
  select status into previous_status from public.tbl_partner_profiles where user_id=p_user_id for update;
  if previous_status is null then raise exception 'Partner application not found'; end if;
  update public.tbl_partner_profiles set status=target_status,reviewed_at=now(),reviewed_by=me,
    reviewed_by_auth_user_id=auth_actor,decision_reason=nullif(btrim(coalesce(p_reason,'')),''),updated_at=now()
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
  ) values(p_user_id,previous_status,target_status,nullif(btrim(coalesce(p_reason,'')),''),me,auth_actor,to_jsonb(profile));
  perform private.enqueue_notification(
    p_user_id,'partner_application_decision',
    case target_status when 'APPROVED' then 'Partner account approved'
      when 'REJECTED' then 'Partner application needs attention'
      when 'SUSPENDED' then 'Partner account suspended' else 'Partner application under review' end,
    coalesce(nullif(btrim(coalesce(p_reason,'')),''),case when target_status='APPROVED'
      then 'You can now host paid activities.' else 'Open your Partner profile for details.' end),
    p_user_id::text,me,jsonb_build_object('status',target_status,'reviewer_auth_user_id',auth_actor)
  );
  return to_jsonb(profile);
end $$;

create or replace function private.admin_update_partner_finance_config(
  p_platform_fee_bps integer,p_gst_enabled boolean,p_gst_bps integer,p_gst_basis text,
  p_settlement_days integer,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); auth_actor uuid:=auth.uid(); result public.tbl_partner_finance_config;
begin
  if not private.is_finance_admin() or auth_actor is null then raise exception 'Finance admin access required' using errcode='42501'; end if;
  if p_platform_fee_bps not between 0 and 10000 or p_settlement_days not between 0 and 90 then raise exception 'Invalid fee or settlement window' using errcode='22023'; end if;
  if (not p_gst_enabled and (p_gst_bps<>0 or p_gst_basis<>'disabled'))
     or (p_gst_enabled and (p_gst_bps not between 1 and 10000 or p_gst_basis not in ('gross','platform_fee'))) then
    raise exception 'GST rate and basis must be explicitly configured together' using errcode='22023';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'A configuration change reason is required'; end if;
  update public.tbl_partner_finance_config set
    platform_fee_bps=p_platform_fee_bps,gst_enabled=p_gst_enabled,gst_bps=p_gst_bps,
    gst_basis=p_gst_basis,settlement_days=p_settlement_days,updated_at=now(),updated_by=me,
    updated_by_auth_user_id=auth_actor where singleton returning * into result;
  insert into public.tbl_partner_finance_config_history(
    platform_fee_bps,gst_enabled,gst_bps,gst_basis,settlement_days,changed_by,changed_by_auth_user_id,reason
  ) values(p_platform_fee_bps,p_gst_enabled,p_gst_bps,p_gst_basis,p_settlement_days,me,auth_actor,btrim(p_reason));
  insert into public.tbl_partner_finance_audit(actor_user_id,actor_auth_user_id,action,entity_type,entity_id,after_data,reason)
  values(me,auth_actor,'FINANCE_CONFIG_CHANGED','finance_config','singleton',to_jsonb(result),btrim(p_reason));
  return to_jsonb(result);
end $$;

create or replace function private.admin_update_partner_settlement(
  p_settlement_id bigint,p_status text,p_payout_reference text default null,p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.get_current_app_user_id(); auth_actor uuid:=auth.uid();
  before_row public.tbl_partner_settlements; after_row public.tbl_partner_settlements;
  target text:=upper(p_status);
begin
  if not private.is_finance_admin() or auth_actor is null then raise exception 'Finance admin access required' using errcode='42501'; end if;
  if target not in ('PENDING','PROCESSING','PAID','FAILED','ON_HOLD') then raise exception 'Invalid settlement status'; end if;
  if target='PAID' and nullif(btrim(coalesce(p_payout_reference,'')),'') is null then raise exception 'A payout reference is required before marking paid'; end if;
  select * into before_row from public.tbl_partner_settlements where id=p_settlement_id for update;
  if before_row.id is null then raise exception 'Settlement not found'; end if;
  if target='PAID' and (before_row.eligible_at is null or before_row.eligible_at>now()) then raise exception 'Settlement is not eligible yet'; end if;
  update public.tbl_partner_settlements set status=target,
    payout_reference=coalesce(nullif(btrim(coalesce(p_payout_reference,'')),''),payout_reference),
    note=nullif(btrim(coalesce(p_note,'')),''),paid_at=case when target='PAID' then now() else paid_at end,
    updated_by=me,updated_by_auth_user_id=auth_actor,updated_at=now()
  where id=p_settlement_id returning * into after_row;
  if target='PAID' then update public.tbl_activity_payments set financial_status='SETTLED'
    where event_id=after_row.event_id and status='paid' and financial_status='PAYABLE'; end if;
  insert into public.tbl_partner_finance_audit(actor_user_id,actor_auth_user_id,action,entity_type,entity_id,before_data,after_data,reason)
  values(me,auth_actor,'SETTLEMENT_STATUS_CHANGED','settlement',p_settlement_id::text,to_jsonb(before_row),to_jsonb(after_row),p_note);
  perform private.enqueue_notification(after_row.partner_user_id,'partner_settlement_update','Settlement updated',
    'Settlement status: '||target,after_row.event_id::text,me,jsonb_build_object('settlement_id',after_row.id,'status',target));
  return to_jsonb(after_row);
end $$;

create or replace function private.admin_record_partner_financial_event(
  p_payment_id bigint,p_kind text,p_status text,p_amount_paisa bigint,
  p_provider_reference text,p_idempotency_key text,p_reason text,p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.get_current_app_user_id(); auth_actor uuid:=auth.uid();
  payment public.tbl_activity_payments; event_row public.tbl_events;
  result public.tbl_partner_financial_events; normalized_kind text:=upper(p_kind);
  normalized_status text:=upper(p_status); successful_refunds bigint;
begin
  if not private.is_finance_admin() or auth_actor is null then raise exception 'Finance admin access required' using errcode='42501'; end if;
  if normalized_kind not in ('REFUND','CHARGEBACK','DISPUTE','REVERSAL','ADJUSTMENT')
     or normalized_status not in ('REQUIRED','PENDING','PROCESSING','SUCCEEDED','FAILED','OPEN','RESOLVED') then raise exception 'Invalid financial event kind or status' using errcode='22023'; end if;
  if p_amount_paisa<0 or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
     or nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Amount, idempotency key and reason are required' using errcode='22023'; end if;
  select * into payment from public.tbl_activity_payments where id=p_payment_id and status='paid' for update;
  if payment.id is null then raise exception 'Verified payment not found'; end if;
  select * into event_row from public.tbl_events where id=payment.event_id;
  successful_refunds:=0;
  if normalized_kind='REFUND' and normalized_status='SUCCEEDED' then
    select coalesce(sum(amount_paisa),0) into successful_refunds from public.tbl_partner_financial_events
    where payment_id=payment.id and kind='REFUND' and status='SUCCEEDED';
    if successful_refunds+p_amount_paisa>payment.amount_paisa then raise exception 'Refund total exceeds verified payment'; end if;
  end if;
  insert into public.tbl_partner_financial_events(
    payment_id,event_id,partner_user_id,participant_user_id,kind,status,amount_paisa,
    provider_reference,idempotency_key,reason,metadata,created_by,created_by_auth_user_id
  ) values(payment.id,payment.event_id,event_row.created_by,payment.user_id,normalized_kind,normalized_status,
    p_amount_paisa,nullif(btrim(coalesce(p_provider_reference,'')),''),btrim(p_idempotency_key),
    btrim(p_reason),coalesce(p_metadata,'{}'::jsonb),me,auth_actor) returning * into result;
  update public.tbl_activity_payments set financial_status=case
    when normalized_kind='REFUND' and normalized_status='SUCCEEDED' and successful_refunds+p_amount_paisa>=amount_paisa then 'REFUNDED'
    when normalized_kind in ('CHARGEBACK','REVERSAL') and normalized_status='SUCCEEDED' then 'REVERSED'
    when normalized_kind='DISPUTE' and normalized_status in ('OPEN','PENDING','PROCESSING') then 'DISPUTED'
    when normalized_status in ('REQUIRED','PENDING','PROCESSING','OPEN') then 'ON_HOLD' else financial_status end
  where id=payment.id;
  perform private.refresh_partner_settlement(payment.event_id);
  insert into public.tbl_partner_finance_audit(actor_user_id,actor_auth_user_id,action,entity_type,entity_id,after_data,reason)
  values(me,auth_actor,'FINANCIAL_EVENT_RECORDED','financial_event',result.id::text,to_jsonb(result),p_reason);
  perform private.enqueue_notification(payment.user_id,'payment_financial_update','Payment update',
    initcap(lower(normalized_kind))||' status: '||normalized_status,payment.event_id::text,me,
    jsonb_build_object('financial_event_id',result.id,'kind',normalized_kind,'status',normalized_status));
  return to_jsonb(result);
end $$;

create or replace function private.audit_partner_payout_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor integer:=public.get_current_app_user_id(); auth_actor uuid:=auth.uid();
begin
  insert into public.tbl_partner_finance_audit(
    actor_user_id,actor_auth_user_id,action,entity_type,entity_id,before_data,after_data,reason
  ) values(
    actor,auth_actor,case when tg_op='INSERT' then 'PAYOUT_ACCOUNT_CREATED' else 'PAYOUT_ACCOUNT_CHANGED' end,
    'partner_payout_account',new.user_id::text,
    case when tg_op='INSERT' then null else jsonb_build_object(
      'bank_name',old.bank_name,'account_number_masked',private.mask_financial_value(old.account_number,4),
      'ifsc_masked',private.mask_financial_value(old.ifsc,4),'upi_id_masked',private.mask_financial_value(old.upi_id,4),
      'review_status',old.review_status) end,
    jsonb_build_object('bank_name',new.bank_name,
      'account_number_masked',private.mask_financial_value(new.account_number,4),
      'ifsc_masked',private.mask_financial_value(new.ifsc,4),
      'upi_id_masked',private.mask_financial_value(new.upi_id,4),'review_status',new.review_status),
    case when tg_op='INSERT' then 'Partner payout destination submitted'
      else 'Partner payout destination updated and requires review' end
  );
  return new;
end $$;
