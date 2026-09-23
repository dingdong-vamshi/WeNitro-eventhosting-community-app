-- Partner notification coverage and masked payout-change auditing.

create or replace function private.audit_partner_payout_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor integer:=public.get_current_app_user_id();
begin
  insert into public.tbl_partner_finance_audit(
    actor_user_id,action,entity_type,entity_id,before_data,after_data,reason
  ) values(
    actor,case when tg_op='INSERT' then 'PAYOUT_ACCOUNT_CREATED' else 'PAYOUT_ACCOUNT_CHANGED' end,
    'partner_payout_account',new.user_id::text,
    case when tg_op='INSERT' then null else jsonb_build_object(
      'bank_name',old.bank_name,'account_number_masked',private.mask_financial_value(old.account_number,4),
      'ifsc_masked',private.mask_financial_value(old.ifsc,4),'upi_id_masked',private.mask_financial_value(old.upi_id,4),
      'review_status',old.review_status
    ) end,
    jsonb_build_object(
      'bank_name',new.bank_name,'account_number_masked',private.mask_financial_value(new.account_number,4),
      'ifsc_masked',private.mask_financial_value(new.ifsc,4),'upi_id_masked',private.mask_financial_value(new.upi_id,4),
      'review_status',new.review_status
    ),
    case when tg_op='INSERT' then 'Partner payout destination submitted'
      else 'Partner payout destination updated and requires review' end
  );
  return new;
end $$;

drop trigger if exists audit_partner_payout_change on public.tbl_partner_payout_accounts;
create trigger audit_partner_payout_change
after insert or update of bank_name,account_holder_name,account_number,ifsc,upi_id,review_status
on public.tbl_partner_payout_accounts for each row
execute function private.audit_partner_payout_change();

create or replace function private.notify_partner_payment_transition()
returns trigger language plpgsql security definer set search_path='' as $$
declare host_id integer; activity_title text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select e.created_by,e.title into host_id,activity_title
  from public.tbl_events e where e.id=new.event_id;
  if new.status='paid' then
    perform private.enqueue_notification(
      host_id,'partner_paid_registration','New paid registration',
      'A participant payment was verified for '||coalesce(activity_title,'your activity')||'.',
      new.event_id::text,new.user_id,jsonb_build_object('payment_id',new.id,'amount_paisa',new.amount_paisa)
    );
  elsif new.status in ('failed','cancelled','expired') then
    perform private.enqueue_notification(
      new.user_id,'activity_payment_failed','Payment not confirmed',
      case new.status when 'expired' then 'The payment session expired. Your place is not confirmed.'
        when 'cancelled' then 'The payment was cancelled. Your place is not confirmed.'
        else 'The payment failed. Your place is not confirmed.' end,
      new.event_id::text,null,jsonb_build_object('payment_id',new.id,'status',new.status)
    );
  end if;
  return new;
end $$;

drop trigger if exists notify_partner_payment_transition on public.tbl_activity_payments;
create trigger notify_partner_payment_transition
after update of status on public.tbl_activity_payments
for each row execute function private.notify_partner_payment_transition();

create or replace function private.notify_partner_activity_completed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='completed' and old.status is distinct from 'completed'
     and exists(select 1 from public.tbl_partner_profiles p where p.user_id=new.created_by) then
    perform private.enqueue_notification(
      new.created_by,'partner_activity_ended','Activity ended',
      'Settlement eligibility is being calculated for '||new.title||'.',
      new.id::text,null,jsonb_build_object('event_id',new.id)
    );
    perform private.refresh_partner_settlement(new.id);
  end if;
  return new;
end $$;

drop trigger if exists notify_partner_activity_completed on public.tbl_events;
create trigger notify_partner_activity_completed
after update of status on public.tbl_events
for each row execute function private.notify_partner_activity_completed();

create or replace function public.cancel_activity(p_event_id integer)
returns void language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.get_current_app_user_id(); payment public.tbl_activity_payments;
  participant record; activity_title text;
begin
  if auth.uid() is null or me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.can_manage_activity(p_event_id,me) then raise exception 'Activity not found or not manageable' using errcode='42501'; end if;
  update public.tbl_events set is_cancelled=true,status='cancelled',updated_by=me,updated_at=now()
  where id=p_event_id returning title into activity_title;
  for participant in select user_id from public.tbl_event_participants
    where event_id=p_event_id and status<>'left'
  loop
    perform private.enqueue_notification(
      participant.user_id,'activity_cancelled','Activity cancelled',
      coalesce(activity_title,'The activity')||' was cancelled by the host.',
      p_event_id::text,me,jsonb_build_object('event_id',p_event_id)
    );
  end loop;
  for payment in select * from public.tbl_activity_payments
    where event_id=p_event_id and status='paid' and financial_status not in ('REFUNDED','REVERSED')
  loop
    perform private.queue_required_refund(payment,'ACTIVITY_CANCELLED_BY_HOST');
  end loop;
  update public.tbl_partner_settlements set status='ON_HOLD',
    note='Activity cancelled; refund review required',updated_at=now()
  where event_id=p_event_id and status<>'PAID';
  insert into public.tbl_partner_finance_audit(actor_user_id,action,entity_type,entity_id,reason)
  values(me,'PARTNER_ACTIVITY_CANCELLED','activity',p_event_id::text,'Host or co-host cancelled the activity');
  perform private.enqueue_notification(
    me,'partner_activity_cancelled','Activity cancellation recorded',
    'Cancellation was recorded and eligible paid registrations entered refund review.',
    p_event_id::text,null,jsonb_build_object('event_id',p_event_id)
  );
end $$;

create or replace function private.admin_search_partner_applications(
  p_status text default null,p_city text default null,p_category text default null,
  p_submitted_from timestamptz default null,p_submitted_to timestamptz default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_wenitro_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',p.user_id,'business_name',p.business_name,'description',p.description,
    'city',p.city,'activity_types',p.activity_types,'activity_location',p.activity_location,
    'age_category',p.age_category,'status',p.status,'submitted_at',p.submitted_at,
    'reviewed_at',p.reviewed_at,'decision_reason',p.decision_reason,
    'user',jsonb_build_object('fullname',u.fullname,'username',u.username,'email',u.email,'phone_e164',u.phone_e164),
    'payout_account',case when a.user_id is null then null else jsonb_build_object(
      'bank_name',a.bank_name,'account_holder_name',a.account_holder_name,
      'account_number_masked',private.mask_financial_value(a.account_number,4),
      'ifsc_masked',private.mask_financial_value(a.ifsc,4),
      'upi_id_masked',private.mask_financial_value(a.upi_id,4),
      'review_status',a.review_status,'review_reason',a.review_reason
    ) end
  ) order by p.submitted_at desc nulls last),'[]'::jsonb) into result
  from public.tbl_partner_profiles p join public.tbl_users u on u.id=p.user_id
  left join public.tbl_partner_payout_accounts a on a.user_id=p.user_id
  where (p_status is null or p.status=upper(p_status))
    and (nullif(btrim(coalesce(p_city,'')),'') is null or p.city ilike '%'||btrim(p_city)||'%')
    and (nullif(btrim(coalesce(p_category,'')),'') is null or exists(
      select 1 from unnest(p.activity_types) t where t ilike '%'||btrim(p_category)||'%'))
    and (p_submitted_from is null or p.submitted_at>=p_submitted_from)
    and (p_submitted_to is null or p.submitted_at<=p_submitted_to);
  return result;
end $$;

create or replace function public.admin_search_partner_applications(
  p_status text default null,p_city text default null,p_category text default null,
  p_submitted_from timestamptz default null,p_submitted_to timestamptz default null
) returns jsonb language sql stable security invoker set search_path='' as $$
  select private.admin_search_partner_applications(
    p_status,p_city,p_category,p_submitted_from,p_submitted_to
  )
$$;

revoke all on function private.audit_partner_payout_change(),
  private.notify_partner_payment_transition(),private.notify_partner_activity_completed(),
  private.admin_search_partner_applications(text,text,text,timestamptz,timestamptz)
from public,anon,authenticated;
revoke all on function public.admin_search_partner_applications(text,text,text,timestamptz,timestamptz)
from public,anon;
grant execute on function public.admin_search_partner_applications(text,text,text,timestamptz,timestamptz)
to authenticated;
