-- Canonical deployed invite functions before lifecycle guard; latest dual-payment condition included.
create or replace function public.create_activity_invite(p_event_id integer, p_expires_at timestamptz default now()+interval '7 days', p_max_uses integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare me integer:=public.get_current_app_user_id(); raw_token text:=extensions.gen_random_uuid()::text; invite_id bigint;
begin
  if not private.can_manage_activity(p_event_id,me) then raise exception 'Only a host or co-host can create an invite' using errcode='42501'; end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '30 days' then raise exception 'Invite expiry must be within 30 days'; end if;
  if p_max_uses is not null and p_max_uses not between 1 and 500 then raise exception 'Invite use limit must be between 1 and 500'; end if;
  insert into public.tbl_activity_invites(event_id,token_hash,created_by,expires_at,max_uses)
  values(p_event_id,encode(extensions.digest(raw_token,'sha256'),'hex'),me,p_expires_at,p_max_uses)
  returning id into invite_id;
  return jsonb_build_object('id',invite_id,'event_id',p_event_id,'token',raw_token,'expires_at',p_expires_at);
end
$$;
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
  target_status:=case when event_row.is_paid and event_row.payment_collection_mode='cashfree' then 'payment_required' else 'approved' end;
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
