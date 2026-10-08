-- Give the Admin UI authoritative, privacy-safe account and verification facts.
-- Keep the legacy isverified value visible to the read model for auditing, but
-- derive the current fully-verified result from the same four checks used by
-- private.sync_verification_rewards.
create or replace function public.admin_list_users()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_wenitro_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select jsonb_build_object(
    'id', u.id,
    'account_type', u.account_type,
    'fullname', u.fullname,
    'username', u.username,
    'email', u.email,
    'profile_image', u.profile_image,
    'nationality', u.nationality,
    'countrycode', u.countrycode,
    'phonenumber', u.phonenumber,
    'create_at', u.create_at,
    'is_active', u.is_active,
    'is_delete', u.is_delete,
    'isverified', u.isverified,
    'rating', u.rating,
    'points', u.points,
    'banned_until', a.banned_until,
    'is_admin_restricted', coalesce(a.banned_until > now(), false),
    'email_verified', checks.email_verified,
    'phone_verified', checks.phone_verified,
    'selfie_verified', checks.selfie_verified,
    'aadhaar_verified', checks.aadhaar_verified,
    'is_fully_verified', checks.email_verified and checks.phone_verified
      and checks.selfie_verified and checks.aadhaar_verified,
    'is_test_account',
      coalesce(a.raw_app_meta_data->>'qa_fixture', '') = 'true'
      or coalesce(a.raw_user_meta_data->>'qa_fixture', '') = 'true'
      or coalesce(u.fullname, '') ilike '[QA]%'
      or coalesce(u.email, '') ilike 'qa.%@example.com'
      or coalesce(u.email, '') ilike 'qa-%@example.com'
      or coalesce(u.email, '') ilike 'wenitro.qa.%@example.com'
  )
  from public.tbl_users u
  left join auth.users a on a.id = u.auth_user_id
  cross join lateral (
    select
      coalesce(a.email_confirmed_at is not null, false) as email_verified,
      coalesce(a.phone_confirmed_at is not null, false) as phone_verified,
      exists (
        select 1 from public.tbl_user_verification v
        where v.user_id = u.id
          and v.live_photo_verified
          and v.status = 'approved'
      ) as selfie_verified,
      private.has_verified_aadhaar(u.id) as aadhaar_verified
  ) checks
  order by u.id desc;
end
$$;

create or replace function public.admin_list_verifications(
  p_status text default null,
  p_limit integer default 50,
  p_before_id integer default null
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_wenitro_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select jsonb_build_object(
    'id', v.id,
    'user_id', v.user_id,
    'verification_type', v.verification_type,
    'status', v.status,
    'document_path', v.document_path,
    'document_mime', v.document_mime,
    'document_size', v.document_size,
    'has_live_photo', v.live_photo_path is not null,
    'live_photo_verified', v.live_photo_verified and v.status = 'approved',
    'aadhaar_verified', private.has_verified_aadhaar(v.user_id),
    'review_notes', v.review_notes,
    'submitted_at', v.submitted_at,
    'reviewed_at', v.reviewed_at,
    'created_at', v.created_at,
    'updated_at', v.updated_at,
    'user', jsonb_build_object(
      'id', u.id,
      'username', u.username,
      'fullname', u.fullname,
      'email', u.email,
      'profile_image', u.profile_image
    )
  )
  from public.tbl_user_verification v
  join public.tbl_users u on u.id = v.user_id
  where (p_status is null or v.status = p_status)
    and (p_before_id is null or v.id < p_before_id)
  order by v.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end
$$;

revoke all on function public.admin_list_users(),
  public.admin_list_verifications(text, integer, integer)
  from public, anon;
grant execute on function public.admin_list_users(),
  public.admin_list_verifications(text, integer, integer)
  to authenticated;
