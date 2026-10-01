-- Narrow client-contract repair. Preserve historical Nitro ledger entries.
-- Retain the existing community role/approval logic while fixing dropped edit fields.
do $$
declare original text; revised text;
begin
  select pg_get_functiondef('private.community_manage(integer,text,jsonb)'::regprocedure) into original;
  revised := replace(original, '    update public.tbl_chat_rooms' || chr(10) || '    set title = trim(p_patch->>''name''),',
    $patch$    if p_patch ? 'cover_path' and nullif(p_patch->>'cover_path','') is not null and not exists (
      select 1 from storage.objects where bucket_id='communities' and name=p_patch->>'cover_path' and owner_id=auth.uid()::text
    ) then raise exception 'Invalid cover path' using errcode='42501'; end if;
    if p_patch ? 'visibility' and p_patch->>'visibility' not in ('public','private') then raise exception 'Invalid visibility'; end if;
    if p_patch ? 'rules' and (jsonb_typeof(p_patch->'rules')<>'array' or jsonb_array_length(p_patch->'rules')>20) then raise exception 'Invalid rules'; end if;
    update public.tbl_chat_rooms
    set cover_url=case when p_patch ? 'cover_path' then nullif(p_patch->>'cover_path','') else cover_url end,
        visibility=case when p_patch ? 'visibility' then p_patch->>'visibility' else visibility end,
        rules=case when p_patch ? 'rules' then array(select jsonb_array_elements_text(p_patch->'rules')) else rules end,
        title = trim(p_patch->>'name'),$patch$);
  if revised=original then raise exception 'Unexpected community edit contract; inspect before applying'; end if;
  execute revised;
end $$;

-- Verification contributes to the derived Trust Score, never new Nitro rewards.
create or replace function private.sync_verification_rewards(p_auth_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me integer; email_ok boolean; phone_ok boolean; photo_ok boolean; aadhaar_ok boolean;
  photo_pending boolean; fully_verified boolean;
begin
  select id into me from public.tbl_users
  where auth_user_id=p_auth_id and coalesce(is_delete,0)=0 for update;
  if me is null then return null; end if;
  select email_confirmed_at is not null, phone_confirmed_at is not null
    into email_ok,phone_ok from auth.users where id=p_auth_id;
  select coalesce(bool_or(live_photo_verified and status='approved'),false),
    coalesce(bool_or(aadhaar_verified and status='approved'),false),
    coalesce(bool_or(live_photo_path is not null and status in ('submitted','under_review')),false)
    into photo_ok,aadhaar_ok,photo_pending
    from public.tbl_user_verification where user_id=me;
  fully_verified := coalesce(email_ok and phone_ok and photo_ok and aadhaar_ok,false);
  update public.tbl_users set isverified=case when fully_verified then 1 else 0 end where id=me;
  return jsonb_build_object('email_verified',coalesce(email_ok,false),
    'phone_verified',coalesce(phone_ok,false),'live_photo_verified',photo_ok,
    'live_photo_pending',photo_pending,'aadhaar_verified',aadhaar_ok,
    'is_verified',fully_verified,'verification_points',0,'points_awarded',0);
end $$;

-- File ownership and format are necessary, but do not prove a photo is a selfie.
-- The existing Admin review queue must approve the private image first.
create or replace function public.submit_my_live_photo(p_path text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer; aid uuid:=auth.uid();
begin
  if aid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into me from public.tbl_users where auth_user_id=aid and coalesce(is_delete,0)=0 for update;
  if me is null then raise exception 'Profile not found' using errcode='42501'; end if;
  if p_path is null or p_path not like aid::text||'/live-photo/%' or not exists (
    select 1 from storage.objects where bucket_id='verification' and name=p_path
      and owner_id=aid::text and metadata->>'mimetype' in ('image/jpeg','image/png')
      and (metadata->>'size')::bigint between 1 and 10485760
  ) then raise exception 'Upload a private JPEG or PNG photo first' using errcode='22023'; end if;
  insert into public.tbl_user_verification(user_id,phone_verified,aadhaar_verified,
    verification_type,status,document_path,live_photo_verified,live_photo_path,submitted_at)
  values(me,false,false,'identity','submitted',p_path,false,p_path,now())
  on conflict(user_id) do update set live_photo_verified=false,live_photo_path=excluded.live_photo_path,
    live_photo_verified_at=null,document_path=excluded.document_path,status='submitted',
    submitted_at=now(),reviewed_at=null,review_notes='',updated_at=now();
  return private.sync_verification_rewards(aid);
end $$;

create or replace function public.admin_review_verification(
  p_verification_id integer,p_status text,p_review_notes text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.tbl_user_verification; aid uuid;
begin
  if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_status not in ('approved','rejected') then raise exception 'Review status must be approved or rejected'; end if;
  update public.tbl_user_verification set status=p_status,
    live_photo_verified=(p_status='approved' and live_photo_path is not null),
    live_photo_verified_at=case when p_status='approved' and live_photo_path is not null then now() else null end,
    review_notes=left(coalesce(p_review_notes,''),2000),reviewed_at=now(),updated_at=now()
    where id=p_verification_id and status in ('submitted','under_review') returning * into v;
  if v.id is null then raise exception 'Verification is unavailable or already reviewed'; end if;
  select auth_user_id into aid from public.tbl_users where id=v.user_id;
  perform private.sync_verification_rewards(aid);
  return jsonb_build_object('id',v.id,'user_id',v.user_id,'status',v.status,
    'review_notes',v.review_notes,'reviewed_at',v.reviewed_at);
end $$;

-- Reconcile badge flags only; do not delete or rewrite historical point awards.
do $$ declare account record; begin
  for account in select auth_user_id from public.tbl_users
    where auth_user_id is not null and coalesce(is_delete,0)=0
  loop perform private.sync_verification_rewards(account.auth_user_id); end loop;
end $$;

create or replace function private.save_participant_rating(
  p_event_id integer,p_user_id integer,p_behaviour integer,p_friendly integer,
  p_communication integer,p_comment text,p_no_show boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); host_id integer;
  r public.tbl_participant_ratings; awarded boolean;
begin
  if auth.uid() is null or me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select created_by into host_id from public.tbl_events where id=p_event_id
    and not coalesce(is_deleted,false) and not coalesce(is_cancelled,false)
    and (status='completed' or event_end_time<=now());
  if host_id is null then raise exception 'Ratings open after the Activity ends' using errcode='42501'; end if;
  if me<>host_id and not exists(select 1 from public.tbl_event_participants
    where event_id=p_event_id and user_id=me and status in ('approved','going','paid'))
  then raise exception 'Only joined participants can rate' using errcode='42501'; end if;
  if me=p_user_id then raise exception 'You cannot rate yourself' using errcode='42501'; end if;
  if p_user_id<>host_id and not exists(select 1 from public.tbl_event_participants
    where event_id=p_event_id and user_id=p_user_id and status in ('approved','going','paid','no_show'))
  then raise exception 'Choose an Activity participant' using errcode='42501'; end if;
  if p_no_show and p_user_id=host_id then raise exception 'The Host cannot be marked No Show' using errcode='42501'; end if;
  if not p_no_show and (p_behaviour is null or p_behaviour not between 1 and 5
    or p_friendly is null or p_friendly not between 1 and 5
    or p_communication is null or p_communication not between 1 and 5)
  then raise exception 'Choose 1 to 5 stars for every rating'; end if;
  if length(btrim(coalesce(p_comment,'')))>1000 then raise exception 'Feedback must be 1000 characters or fewer'; end if;
  insert into public.tbl_participant_ratings(event_id,rater_id,rated_user_id,overall_rating,
    behaviour_rating,friendly_rating,communication_rating,comment,is_no_show,updated_at)
  values(p_event_id,me,p_user_id,case when p_no_show then null else round((p_behaviour+p_friendly+p_communication)::numeric/3)::integer end,
    case when p_no_show then null else p_behaviour end,case when p_no_show then null else p_friendly end,
    case when p_no_show then null else p_communication end,nullif(btrim(coalesce(p_comment,'')),''),p_no_show,now())
  on conflict(event_id,rater_id,rated_user_id) do update set overall_rating=excluded.overall_rating,
    behaviour_rating=excluded.behaviour_rating,friendly_rating=excluded.friendly_rating,
    communication_rating=excluded.communication_rating,comment=excluded.comment,
    is_no_show=excluded.is_no_show,updated_at=now() returning * into r;
  insert into public.tbl_user_points_history(user_id,rating_id,points_earned,verification_method)
    values(me,r.id,2,null) on conflict(user_id,rating_id) do nothing;
  awarded:=found;
  if awarded then update public.tbl_users set points=coalesce(points,0)+2 where id=me; end if;
  update public.tbl_users set rating=coalesce((select round(avg(overall_rating)::numeric,2)
    from public.tbl_participant_ratings where rated_user_id=p_user_id and not coalesce(is_no_show,false)),0)
    where id=p_user_id;
  return to_jsonb(r)||jsonb_build_object('points_awarded',case when awarded then 2 else 0 end);
end $$;
revoke all on function private.save_participant_rating(integer,integer,integer,integer,integer,text,boolean) from public,anon,authenticated;

create or replace function public.rate_activity_participant(p_event_id integer,p_user_id integer,
  p_behaviour integer,p_friendly integer,p_communication integer,p_comment text default '')
returns jsonb language sql security definer set search_path='' as $$
  select private.save_participant_rating(p_event_id,p_user_id,p_behaviour,p_friendly,p_communication,p_comment,false);
$$;
create or replace function public.mark_activity_participant_no_show(p_event_id integer,p_user_id integer)
returns jsonb language sql security definer set search_path='' as $$
  select private.save_participant_rating(p_event_id,p_user_id,null,null,null,'',true);
$$;
revoke all on function public.mark_activity_participant_no_show(integer,integer) from public,anon;
grant execute on function public.mark_activity_participant_no_show(integer,integer) to authenticated;

create or replace function public.list_activity_participant_ratings(p_event_id integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.tbl_events e where e.id=p_event_id
    and (e.created_by=me or exists(select 1 from public.tbl_event_participants p
      where p.event_id=e.id and p.user_id=me and p.status in ('approved','going','paid','no_show'))))
  then raise exception 'Activity ratings are unavailable' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc),'[]'::jsonb) into result
  from public.tbl_participant_ratings r where r.event_id=p_event_id and r.rater_id=me;
  return result;
end $$;
