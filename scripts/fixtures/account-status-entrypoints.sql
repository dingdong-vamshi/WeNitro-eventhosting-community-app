-- Existing target RPC definitions captured read-only 2026-10-03, before the
-- account-status migration; contains schema code only, no records or secrets.
CREATE OR REPLACE FUNCTION public.list_active_stories(p_limit integer DEFAULT 50, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id bigint DEFAULT NULL::bigint)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select to_jsonb(s) || jsonb_build_object(
    'owner', jsonb_build_object(
      'id', u.id,
      'username', u.username,
      'fullname', u.fullname,
      'profile_image', u.profile_image
    ),
    'viewed', exists (
      select 1 from public.tbl_story_views sv
      where sv.story_id = s.id and sv.viewer_id = public.current_app_user_id()
    )
  )
  from public.tbl_stories s
  join public.tbl_users u on u.id = s.user_id
  where s.deleted_at is null
    and s.expires_at > now()
    and (
      p_before_created_at is null
      or (s.created_at, s.id) < (p_before_created_at, coalesce(p_before_id, 9223372036854775807::bigint))
    )
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$function$
;
CREATE OR REPLACE FUNCTION private.bootstrap_my_profile()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  auth_row auth.users%rowtype;
  profile_id integer;
  email_profile_id integer;
  phone_profile_id integer;
  email_matches bigint := 0;
  phone_matches bigint := 0;
  existing_auth_user_id uuid;
  normalized_email text;
  normalized_phone text;
  storage_email text;
  metadata_full_name text;
  full_name text;
  username_seed text;
  username_base text;
  generated_username text;
  uuid_suffix text;
  username_attempt integer := 0;
  country_code text;
  national_phone bigint;
  active_value integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into auth_row from auth.users where id = auth.uid();
  if not found then raise exception 'Authentication required' using errcode = '42501'; end if;
  select u.id into profile_id from public.tbl_users u where u.auth_user_id = auth_row.id limit 1;
  if profile_id is not null then
    insert into public.tbl_user_privacy_settings(user_id) values (profile_id) on conflict(user_id) do nothing;
    return profile_id;
  end if;
  normalized_email := nullif(lower(btrim(auth_row.email)), '');
  normalized_phone := private.normalize_phone_e164(auth_row.phone);
  metadata_full_name := nullif(btrim(coalesce(auth_row.raw_user_meta_data ->> 'full_name',auth_row.raw_user_meta_data ->> 'fullname',auth_row.raw_user_meta_data ->> 'name','')), '');
  if normalized_email is not null then
    select min(u.id), count(*) into email_profile_id, email_matches from public.tbl_users u where lower(btrim(u.email)) = normalized_email;
    if email_matches > 1 then raise exception 'Email matches multiple legacy accounts' using errcode = '23505'; end if;
  end if;
  if normalized_phone is not null then
    select min(u.id), count(*) into phone_profile_id, phone_matches from public.tbl_users u
    where u.phone_e164 = normalized_phone or (u.phone_e164 is null and private.normalize_phone_e164(coalesce(u.countrycode, '') || coalesce(u.phonenumber::text, '')) = normalized_phone);
    if phone_matches > 1 then raise exception 'Phone matches multiple legacy accounts' using errcode = '23505'; end if;
  end if;
  if email_profile_id is not null and phone_profile_id is not null and email_profile_id <> phone_profile_id then
    raise exception 'Email and phone belong to different legacy accounts' using errcode = '23505';
  end if;
  profile_id := coalesce(email_profile_id, phone_profile_id);
  active_value := case when auth_row.email_confirmed_at is not null or auth_row.phone_confirmed_at is not null then 1 else 0 end;
  if normalized_phone ~ '^\+91[6-9][0-9]{9}$' then country_code := '+91'; national_phone := substring(normalized_phone from 4)::bigint; end if;
  if profile_id is not null then
    perform 1 from public.tbl_users u where u.id = profile_id for update;
    select u.auth_user_id into existing_auth_user_id from public.tbl_users u where u.id = profile_id;
    if existing_auth_user_id is not null and existing_auth_user_id <> auth_row.id then
      raise exception 'Legacy account is already linked to another auth user' using errcode = '23505';
    end if;
    update public.tbl_users set auth_user_id = auth_row.id,is_active = active_value,is_delete = 0,
      fullname = coalesce(left(metadata_full_name, 150), fullname),phone_e164 = coalesce(normalized_phone, phone_e164),
      countrycode = coalesce(country_code, countrycode),phonenumber = coalesce(national_phone, phonenumber)
    where id = profile_id;
  else
    uuid_suffix := left(replace(auth_row.id::text, '-', ''), 12);
    username_seed := coalesce(nullif(auth_row.raw_user_meta_data ->> 'username', ''),case when normalized_email is not null then split_part(normalized_email, '@', 1) end,'member');
    username_base := lower(regexp_replace(btrim(username_seed), '[^a-zA-Z0-9_]+', '_', 'g'));
    username_base := btrim(username_base, '_');
    if username_base = '' then username_base := 'member'; end if;
    perform pg_advisory_xact_lock(hashtext('wenitro:auth-bridge:username'));
    loop
      generated_username := left(username_base, 80) || '_' || uuid_suffix;
      if username_attempt > 0 then generated_username := left(username_base, 74) || '_' || uuid_suffix || '_' || username_attempt::text; end if;
      generated_username := left(generated_username, 100);
      exit when not exists (select 1 from public.tbl_users u where lower(u.username) = lower(generated_username));
      username_attempt := username_attempt + 1;
      if username_attempt > 100 then raise exception 'Unable to allocate a unique username' using errcode = '23505'; end if;
    end loop;
    full_name := left(coalesce(metadata_full_name,case when normalized_email is not null then split_part(normalized_email, '@', 1) end,'WeNitro member'), 150);
    storage_email := coalesce(normalized_email,'auth-phone-' || replace(auth_row.id::text, '-', '') || '@invalid.wenitro.local');
    insert into public.tbl_users(username,fullname,email,password,is_active,is_delete,auth_user_id,phone_e164,countrycode,phonenumber,account_type)
    values (generated_username,full_name,storage_email,'supabase-auth-managed',active_value,0,auth_row.id,normalized_phone,country_code,national_phone,'individual')
    returning id into profile_id;
    if auth_row.raw_user_meta_data ->> 'account_type' = 'partner' then
      insert into public.tbl_partner_profiles(user_id,status) values(profile_id,'draft') on conflict(user_id) do nothing;
    end if;
  end if;
  insert into public.tbl_user_privacy_settings(user_id) values (profile_id) on conflict(user_id) do nothing;
  return profile_id;
end
$function$
;
CREATE OR REPLACE FUNCTION private.check_onboarding_username(p_username text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me integer; proposed text:=lower(btrim(p_username));
begin
  select id into me from public.tbl_users where auth_user_id=auth.uid() and is_active=1 and coalesce(is_delete,0)=0;
  if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if proposed is null or proposed !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'Username must be 3-30 letters, numbers, or underscores' using errcode='22023';
  end if;
  return not exists(select 1 from public.tbl_users where lower(username)=proposed and id<>me);
end $function$
;
CREATE OR REPLACE FUNCTION private.complete_my_onboarding(p_expected_auth_user_id uuid, p_full_name text, p_username text, p_dob date DEFAULT NULL::date, p_gender text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me integer; proposed text:=lower(btrim(p_username));
begin
  if p_expected_auth_user_id is null or p_expected_auth_user_id is distinct from auth.uid() then
    raise exception 'Signed-in account changed' using errcode='42501';
  end if;
  select id into me from public.tbl_users where auth_user_id=auth.uid() and is_active=1 and coalesce(is_delete,0)=0 for update;
  if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_full_name is null or char_length(btrim(p_full_name)) not between 1 and 150 then
    raise exception 'Full name must contain 1-150 characters' using errcode='22023';
  end if;
  if proposed is null or proposed !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'Username must be 3-30 letters, numbers, or underscores' using errcode='22023';
  end if;
  if p_dob is not null and p_dob>current_date then
    raise exception 'Date of birth cannot be in the future' using errcode='22023';
  end if;
  -- Preserve the existing profile service's 18+ validation for supplied DOBs.
  if p_dob is not null and extract(year from age(current_date,p_dob))<18 then
    raise exception 'WeNitro profiles require a minimum age of 18' using errcode='22023';
  end if;
  if p_gender is not null and p_gender not in ('male','female','non_binary','prefer_not_to_say') then
    raise exception 'Choose one of the displayed gender options' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('wenitro:auth-bridge:username'));
  if not private.check_onboarding_username(proposed) then
    raise exception 'Username is already taken' using errcode='23505';
  end if;
  update public.tbl_users set fullname=btrim(p_full_name),username=proposed,dob=p_dob,gender=p_gender,onboarding_completed=true where id=me;
  return me;
end $function$
;
CREATE OR REPLACE FUNCTION public.submit_my_live_photo(p_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.sync_my_verification()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  result := private.sync_verification_rewards(auth.uid());
  if result is null then raise exception 'Profile not found' using errcode='42501'; end if;
  return result;
end $function$
;
