create or replace function public.admin_list_users()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_wenitro_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select jsonb_build_object(
    'id', u.id,
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
    'points', u.points
  )
  from public.tbl_users u
  order by u.id desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;
