-- Reciprocal legacy friendship rows represent one Squad relationship.
create or replace function public.list_my_squad()
returns jsonb language sql stable security definer set search_path='' as $$
  with me as (select public.get_current_app_user_id() id), related as (
    select case when f.user_id=me.id then f.friend_id else f.user_id end member_id,
      min(f.created_at) connected_at
    from public.tbl_friends f cross join me
    where (f.user_id=me.id or f.friend_id=me.id) and f.user_id<>f.friend_id
    group by case when f.user_id=me.id then f.friend_id else f.user_id end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'username',u.username,'fullname',u.fullname,
    'profile_image',u.profile_image,'isverified',u.isverified,'connected_at',r.connected_at
  ) order by coalesce(u.fullname,u.username),u.id),'[]'::jsonb)
  from related r join public.tbl_users u on u.id=r.member_id
  where coalesce(u.is_delete,0)=0 and coalesce(u.is_active,1)=1
$$;
