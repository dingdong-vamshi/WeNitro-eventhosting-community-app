-- Reuse the existing ledger. Legacy participation rewards remain unchanged.
alter table public.tbl_user_points_history alter column rating_id drop not null;
alter table public.tbl_user_points_history add column verification_method text;
alter table public.tbl_user_points_history add constraint verification_reward_valid check (
  (verification_method is null and rating_id is not null) or
  (verification_method is not null and verification_method in ('email','phone','live_photo') and rating_id is null and points_earned = 10)
);
create unique index verification_reward_once on public.tbl_user_points_history(user_id, verification_method)
  where verification_method is not null;

-- Separate photo completion from historical identity-review documents.
alter table public.tbl_user_verification
  add column live_photo_verified boolean not null default false,
  add column live_photo_path text,
  add column live_photo_verified_at timestamptz;

create or replace function private.sync_verification_rewards(p_auth_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me integer; email_ok boolean; phone_ok boolean; photo_ok boolean;
  awarded integer; verification_points integer;
begin
  select id into me from public.tbl_users
  where auth_user_id=p_auth_id and coalesce(is_delete,0)=0 for update;
  if me is null then return null; end if;
  select email_confirmed_at is not null, phone_confirmed_at is not null
    into email_ok, phone_ok from auth.users where id=p_auth_id;
  select coalesce(bool_or(live_photo_verified),false) into photo_ok
    from public.tbl_user_verification where user_id=me;
  with added as (
    insert into public.tbl_user_points_history(user_id,rating_id,points_earned,verification_method)
    select me,null,10,method from (values ('email',email_ok),('phone',phone_ok),('live_photo',photo_ok)) v(method,completed)
    where completed
    on conflict (user_id,verification_method) where verification_method is not null do nothing
    returning points_earned
  ) select coalesce(sum(points_earned),0) into awarded from added;
  update public.tbl_users set points=coalesce(points,0)+awarded,
    isverified=case when email_ok or phone_ok or photo_ok then 1 else 0 end where id=me;
  select coalesce(sum(points_earned),0) into verification_points from public.tbl_user_points_history
    where user_id=me and verification_method is not null;
  return jsonb_build_object('email_verified',email_ok,'phone_verified',phone_ok,
    'live_photo_verified',photo_ok,'is_verified',email_ok or phone_ok or photo_ok,
    'verification_points',verification_points,'points_awarded',awarded);
end $$;
revoke all on function private.sync_verification_rewards(uuid) from public, anon, authenticated;

create or replace function public.sync_my_verification()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  result := private.sync_verification_rewards(auth.uid());
  if result is null then raise exception 'Profile not found' using errcode='42501'; end if;
  return result;
end $$;
revoke all on function public.sync_my_verification() from public, anon;
grant execute on function public.sync_my_verification() to authenticated;

create or replace function private.on_auth_verification_reward()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_verification_rewards(new.id);
  return new;
end $$;
revoke all on function private.on_auth_verification_reward() from public, anon, authenticated;
create trigger zzz_auth_verification_rewards after insert or update of email_confirmed_at,phone_confirmed_at
  on auth.users for each row execute function private.on_auth_verification_reward();

create or replace function public.submit_my_live_photo(p_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me integer; aid uuid := auth.uid();
begin
  if aid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into me from public.tbl_users where auth_user_id=aid and coalesce(is_delete,0)=0 for update;
  if me is null then raise exception 'Profile not found' using errcode='42501'; end if;
  if p_path is null or p_path not like aid::text || '/live-photo/%' or not exists (
    select 1 from storage.objects where bucket_id='verification' and name=p_path
      and owner_id=aid::text and metadata->>'mimetype' in ('image/jpeg','image/png')
      and (metadata->>'size')::bigint between 1 and 10485760
  ) then raise exception 'Upload a private JPEG or PNG photo first' using errcode='22023'; end if;
  insert into public.tbl_user_verification(user_id,phone_verified,aadhaar_verified,verification_type,status,
    live_photo_verified,live_photo_path,live_photo_verified_at)
  values(me,false,false,'identity','draft',true,p_path,now())
  on conflict (user_id) do update set live_photo_verified=true,live_photo_path=excluded.live_photo_path,
    live_photo_verified_at=coalesce(public.tbl_user_verification.live_photo_verified_at,now()),updated_at=now();
  return private.sync_verification_rewards(aid);
end $$;
revoke all on function public.submit_my_live_photo(text) from public, anon;
grant execute on function public.submit_my_live_photo(text) to authenticated;

create or replace function public.list_my_nitro_history()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select public.get_current_app_user_id() id), entries as (
    select h.id,h.points_earned,h.created_at,h.verification_method,r.event_id,e.title
    from public.tbl_user_points_history h join me on me.id=h.user_id
    left join public.tbl_participant_ratings r on r.id=h.rating_id
    left join public.tbl_events e on e.id=r.event_id order by h.created_at desc,h.id desc limit 100
  ) select jsonb_build_object('balance',(select coalesce(u.points,0) from public.tbl_users u join me on me.id=u.id),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'points',points_earned,'created_at',created_at,
      'event_id',event_id,'description',case verification_method when 'email' then 'Email verification'
        when 'phone' then 'Phone verification' when 'live_photo' then 'Live Photo verification'
        else case when title is null then 'Activity participation rating' else 'Rating for '||title end end)
      order by created_at desc,id desc) from entries),'[]'::jsonb));
$$;

-- Reconcile genuinely confirmed existing users; never infer verification from QA status or metadata.
do $$ declare account record; begin
  for account in select a.id from auth.users a join public.tbl_users u on u.auth_user_id=a.id
    where coalesce(u.is_delete,0)=0 and (a.email_confirmed_at is not null or a.phone_confirmed_at is not null)
  loop perform private.sync_verification_rewards(account.id); end loop;
end $$;
