-- Restore the restricted column-level reads used by public profile and
-- anonymous community-post policies. These are intentionally not table-wide
-- SELECT grants because private identity columns must remain inaccessible.

grant select (
  id,
  room_id,
  title,
  body,
  media_url,
  media_type,
  created_at,
  updated_at,
  deleted_at,
  category,
  is_anonymous
) on public.tbl_community_posts to authenticated;

grant select (
  id,
  username,
  fullname,
  is_active,
  is_delete,
  create_at,
  bio,
  dob,
  gender,
  isverified,
  profile_image,
  rating,
  points,
  nationality,
  about,
  occupation,
  onboarding_completed,
  account_type
) on public.tbl_users to authenticated;
