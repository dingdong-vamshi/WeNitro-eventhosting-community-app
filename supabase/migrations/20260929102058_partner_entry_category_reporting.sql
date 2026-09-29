create or replace function private.get_partner_registrations(p_event_id integer default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); result jsonb;
begin
  if auth.uid() is null or not private.has_active_partner(me) then raise exception 'Approved Partner account required' using errcode='42501'; end if;
  if p_event_id is not null and not private.partner_owns_activity(p_event_id) then raise exception 'Activity ownership required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'participant_id',r.id,'user_id',r.user_id,'event_id',e.id,'activity_title',e.title,
    'display_name',u.fullname,'email',u.email,'phone_e164',u.phone_e164,
    'status',r.status,'payment_status',case when paid.amount>0 then paid.financial_status
      when not e.is_paid then 'FREE' else coalesce(upper(latest.status),'UNPAID') end,
    'amount_paid_paisa',coalesce(paid.amount,0),'registered_at',r.created_at,
    'entry_category_id',r.entry_category_id,
    'entry_category_name',coalesce(latest.entry_category_name,category.name),
    'entry_category_price_paisa',coalesce(latest.amount_paisa,category.price_paisa),
    'answers',(select coalesce(jsonb_agg(jsonb_build_object(
      'question_id',q.id,'label',q.label,'value',a.value
    ) order by q.display_order),'[]'::jsonb)
      from public.tbl_activity_registration_answers a
      join public.tbl_activity_registration_questions q on q.id=a.question_id
      where a.event_id=e.id and a.user_id=r.user_id)
  ) order by r.created_at desc),'[]'::jsonb) into result
  from public.tbl_event_participants r
  join public.tbl_events e on e.id=r.event_id
  join public.tbl_users u on u.id=r.user_id
  left join public.tbl_activity_entry_categories category on category.id=r.entry_category_id
  left join lateral(
    select sum(p.amount_paisa) amount,max(p.financial_status) financial_status
    from public.tbl_activity_payments p
    where p.event_id=e.id and p.user_id=r.user_id and p.status='paid'
  ) paid on true
  left join lateral(
    select p.status,p.entry_category_name,p.amount_paisa
    from public.tbl_activity_payments p
    where p.event_id=e.id and p.user_id=r.user_id order by p.created_at desc limit 1
  ) latest on true
  where e.created_by=me and (p_event_id is null or e.id=p_event_id) and r.status<>'left';
  return result;
end $$;

create or replace function private.get_partner_transactions(p_event_id integer default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); result jsonb;
begin
  if auth.uid() is null or not private.has_active_partner(me) then raise exception 'Approved Partner account required' using errcode='42501'; end if;
  if p_event_id is not null and not private.partner_owns_activity(p_event_id) then raise exception 'Activity ownership required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'payment_id',p.id::text,'event_id',e.id,'activity_title',e.title,
    'display_name',u.fullname,'paid_at',p.paid_at,'amount_paisa',p.amount_paisa,
    'entry_category_id',p.entry_category_id,'entry_category_name',p.entry_category_name,
    'platform_fee_bps',p.platform_fee_bps,'platform_fee_paisa',p.platform_fee_paisa,
    'gst_bps',p.gst_bps,'gst_paisa',p.gst_paisa,'gst_basis',p.gst_basis,
    'partner_net_paisa',p.partner_net_paisa,'financial_status',p.financial_status,
    'settlement_status',s.status,'settlement_due_at',s.due_at,'payout_reference',s.payout_reference
  ) order by p.paid_at desc),'[]'::jsonb) into result
  from public.tbl_activity_payments p join public.tbl_events e on e.id=p.event_id
  join public.tbl_users u on u.id=p.user_id
  left join public.tbl_partner_settlements s on s.event_id=e.id
  where e.created_by=me and (p_event_id is null or e.id=p_event_id) and p.status='paid';
  return result;
end $$;
