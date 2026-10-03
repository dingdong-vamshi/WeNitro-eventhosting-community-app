-- Enforce the same protected-target boundaries as the participant UI.
CREATE OR REPLACE FUNCTION public.respond_activity_join(p_event_id integer, p_user_id integer, p_status text)
 RETURNS tbl_event_participants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me integer:=public.get_current_app_user_id();
  event_row public.tbl_events;
  normalized_status text;
  result_row public.tbl_event_participants;
  occupied integer;
  existing public.tbl_event_participants;
begin
  perform private.assert_activity_mutable(p_event_id);
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
  if p_user_id=event_row.created_by then raise exception 'The original Host cannot be changed through participant management' using errcode='42501'; end if;
  if p_user_id=me then raise exception 'You cannot manage your own participation here' using errcode='42501'; end if;
  select * into existing from public.tbl_event_participants where event_id=p_event_id and user_id=p_user_id for update;
  if existing.id is null then raise exception 'Join request not found'; end if;
  if existing.role='cohost' then raise exception 'The original Host must remove the Co-host role first' using errcode='42501'; end if;
  -- Approval retries never demote an already paid attendee or resend notices.
  -- Removing an unrefunded paid registration needs the financial workflow.
  if exists(select 1 from public.tbl_activity_payments payment
   where payment.event_id=p_event_id and payment.user_id=p_user_id and payment.status='paid'
    and payment.financial_status in ('PAYABLE','SETTLED','ON_HOLD','REFUND_REQUIRED','DISPUTED')) then
   if p_status='approved' and existing.status in ('approved','going','paid') and exists(
    select 1 from public.tbl_activity_payments payment where payment.event_id=p_event_id and payment.user_id=p_user_id
     and payment.status='paid' and payment.financial_status in ('PAYABLE','SETTLED','ON_HOLD')
   ) and not exists(select 1 from public.tbl_activity_payments payment where payment.event_id=p_event_id and payment.user_id=p_user_id and payment.status='paid' and payment.financial_status in ('REFUND_REQUIRED','DISPUTED')) then return existing; end if;
   raise exception 'Paid registration requires payment review before participation can change' using errcode='42501';
  end if;
  if p_status='approved' and existing.status in ('approved','going','paid')
    and not (event_row.is_paid and event_row.payment_collection_mode='cashfree') then return existing; end if;
  normalized_status:=case
    when p_status='waitlist' then 'pending'
    when p_status='approved' and event_row.is_paid and event_row.payment_collection_mode='cashfree' then 'payment_required'
    else p_status end;
  if normalized_status in ('approved','payment_required')
     and event_row.max_participants is not null then
    occupied:=private.activity_occupied_count(p_event_id,p_user_id);
    if occupied>=event_row.max_participants then raise exception 'Activity is full'; end if;
  end if;
  if normalized_status=existing.status then return existing; end if;
  if normalized_status in ('rejected','pending') then
   update public.tbl_activity_payments set status='cancelled',
    provider_status=case when normalized_status='rejected' then 'HOST_REJECTED' else 'HOST_WAITLISTED' end,
    updated_at=now()
   where event_id=p_event_id and user_id=p_user_id and status in ('created','pending');
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
end $function$;

-- Keep late payment confirmation from undoing a Host's rejection/waitlisting.
do $$ declare definition text; begin
 select pg_get_functiondef('public.finalize_activity_payment(text,text,bigint,text,text,jsonb)'::regprocedure) into definition;
 if position('payment.provider_status=''USER_WITHDREW''' in definition)=0 then raise exception 'Unexpected finalizer cancellation guard';end if;
 definition:=replace(definition,'payment.provider_status=''USER_WITHDREW''','payment.provider_status in (''USER_WITHDREW'',''HOST_REJECTED'',''HOST_WAITLISTED'')');
 definition:=replace(definition,'exception_reason:=''PARTICIPANT_WITHDREW_AFTER_PAYMENT'';',
  'exception_reason:=case when payment.provider_status=''USER_WITHDREW'' then ''PARTICIPANT_WITHDREW_AFTER_PAYMENT'' else ''HOST_DECLINED_AFTER_PAYMENT'' end;');
 execute definition;
end $$;
