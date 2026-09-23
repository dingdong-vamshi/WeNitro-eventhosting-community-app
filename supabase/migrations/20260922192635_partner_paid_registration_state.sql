-- Restore the paid registration state machine after the prior onsite-price override.

create or replace function public.request_join_activity(
  p_event_id integer,p_status text default 'going'
) returns public.tbl_event_participants language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.get_current_app_user_id(); event_row public.tbl_events;
  existing public.tbl_event_participants; db_status text;
  result_row public.tbl_event_participants; occupied integer;
begin
  if auth.uid() is null or me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into event_row from public.tbl_events where id=p_event_id for update;
  if event_row.id is null then raise exception 'Activity is unavailable'; end if;
  select * into existing from public.tbl_event_participants
  where event_id=p_event_id and user_id=me for update;

  if p_status in ('left','declined') then
    if existing.id is null then raise exception 'No participation exists to leave'; end if;
    update public.tbl_event_participants set status='left',responded_at=now(),joined_at=null
    where id=existing.id returning * into result_row;
    return result_row;
  end if;

  if p_status not in ('going','interested','waitlist') then raise exception 'Invalid participation status'; end if;
  if event_row.status<>'published' or coalesce(event_row.is_deleted,false) or coalesce(event_row.is_cancelled,false) then raise exception 'Activity is unavailable'; end if;
  if event_row.visibility_type<>'public' and existing.id is null then
    raise exception 'Use a valid invitation to join this private activity' using errcode='42501';
  end if;
  if event_row.created_by=me then raise exception 'Hosts cannot join their own activity'; end if;
  if event_row.registration_close_time is not null and event_row.registration_close_time<now() then raise exception 'Registration is closed'; end if;
  perform private.assert_registration_complete(p_event_id,me);
  select count(*) into occupied from public.tbl_event_participants
  where event_id=p_event_id and user_id<>me and status in ('approved','going','payment_required');
  db_status:=case
    when p_status in ('interested','waitlist') then 'pending'
    when event_row.max_participants is not null and occupied>=event_row.max_participants then 'pending'
    when event_row.join_type='approval' then 'pending'
    when event_row.is_paid then 'payment_required'
    else 'approved' end;
  insert into public.tbl_event_participants(event_id,user_id,status,responded_at,joined_at)
  values(p_event_id,me,db_status,case when db_status='approved' then now() end,case when db_status='approved' then now() end)
  on conflict(event_id,user_id) do update set status=excluded.status,responded_at=excluded.responded_at,joined_at=excluded.joined_at
  returning * into result_row;
  return result_row;
end $$;

create or replace function public.respond_activity_join(
  p_event_id integer,p_user_id integer,p_status text
) returns public.tbl_event_participants language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.get_current_app_user_id(); event_row public.tbl_events;
  normalized_status text; result_row public.tbl_event_participants; occupied integer;
begin
  if auth.uid() is null or me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into event_row from public.tbl_events where id=p_event_id for update;
  if event_row.id is null or not private.can_manage_activity(p_event_id,me) then raise exception 'Only a host or co-host can respond' using errcode='42501'; end if;
  if p_status not in ('approved','rejected','waitlist') then raise exception 'Invalid response'; end if;
  normalized_status:=case
    when p_status='waitlist' then 'pending'
    when p_status='approved' and event_row.is_paid then 'payment_required'
    else p_status end;
  if normalized_status in ('approved','payment_required') and event_row.max_participants is not null then
    select count(*) into occupied from public.tbl_event_participants
    where event_id=p_event_id and user_id<>p_user_id and status in ('approved','going','payment_required');
    if occupied>=event_row.max_participants then raise exception 'Activity is full'; end if;
  end if;
  update public.tbl_event_participants set status=normalized_status,responded_at=now(),
    joined_at=case when normalized_status='approved' then coalesce(joined_at,now()) else null end
  where event_id=p_event_id and user_id=p_user_id returning * into result_row;
  if result_row.id is null then raise exception 'Join request not found'; end if;
  perform private.enqueue_notification(
    p_user_id,'activity_join_decision',
    case when normalized_status='payment_required' then 'Activity request approved — payment required'
      when normalized_status='approved' then 'Activity request approved'
      when normalized_status='rejected' then 'Activity request declined' else 'Activity request waitlisted' end,
    case when normalized_status='payment_required' then 'Complete secure payment to confirm your place.'
      else 'Your activity request status was updated.' end,
    p_event_id::text,me,jsonb_build_object('event_id',p_event_id,'status',normalized_status)
  );
  return result_row;
end $$;

create or replace function public.redeem_activity_invite(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me integer:=public.get_current_app_user_id(); invite public.tbl_activity_invites;
  event_row public.tbl_events; participation public.tbl_event_participants;
  already_active boolean:=false; target_status text;
begin
  if auth.uid() is null or me is null then raise exception 'Authentication required' using errcode='42501'; end if;
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
  if event_row.created_by=me then return jsonb_build_object('event_id',event_row.id,'status','host'); end if;
  select exists(select 1 from public.tbl_event_participants p
    where p.event_id=event_row.id and p.user_id=me and p.status in ('approved','going','payment_required')) into already_active;
  target_status:=case when event_row.is_paid then 'payment_required' else 'approved' end;
  insert into public.tbl_event_participants(event_id,user_id,status,invited_by,responded_at,joined_at)
  values(event_row.id,me,target_status,invite.created_by,now(),case when target_status='approved' then now() end)
  on conflict(event_id,user_id) do update set status=target_status,invited_by=invite.created_by,
    responded_at=now(),joined_at=case when target_status='approved' then coalesce(public.tbl_event_participants.joined_at,now()) else null end
  returning * into participation;
  if not already_active then update public.tbl_activity_invites set uses_count=uses_count+1 where id=invite.id; end if;
  return jsonb_build_object('event_id',event_row.id,'status',participation.status);
end $$;
