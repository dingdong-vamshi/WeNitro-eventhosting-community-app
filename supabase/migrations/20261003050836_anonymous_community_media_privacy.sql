-- Anonymous media is served by community-media, never by an author-identifying
-- Storage path. Deploy that Edge Function before this migration and the app.
-- No objects are moved/deleted; existing anonymous attachments are supported.
begin;

revoke select (media_url) on public.tbl_community_posts from authenticated;

create index if not exists community_anonymous_media_path_idx
  on public.tbl_community_posts(media_url) where is_anonymous and media_url is not null;

create or replace function public.community_list_posts(
  p_room_id integer, p_page integer default 1, p_page_size integer default 20
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  page_number integer := greatest(coalesce(p_page, 1), 1);
  page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  can_identify boolean := public.is_wenitro_admin();
  total_count bigint;
  result_items jsonb;
begin
  perform public.assert_chat_membership(p_room_id);
  if not exists(select 1 from public.tbl_chat_rooms where id=p_room_id and room_type='community') then
    raise exception 'Community not found' using errcode='42501';
  end if;
  select count(*) into total_count from public.tbl_community_posts
    where room_id=p_room_id and deleted_at is null;
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb)
  into result_items from (
    select p.id,p.created_at,
      to_jsonb(p) - 'user_id' - 'media_url' || jsonb_build_object(
        'media_url',case when p.is_anonymous and p.media_url is not null
          then 'anonymous-media:' || p.id::text else p.media_url end,
        'author_id',case when p.is_anonymous and not can_identify then null else p.user_id end,
        'author',case when p.is_anonymous and not can_identify then
          jsonb_build_object('id',null,'username','anonymous','fullname','Anonymous','profile_image',null)
          else jsonb_build_object('id',u.id,'username',u.username,'fullname',u.fullname,'profile_image',u.profile_image) end,
        'can_identify_anonymous',can_identify
      ) item
    from public.tbl_community_posts p join public.tbl_users u on u.id=p.user_id
    where p.room_id=p_room_id and p.deleted_at is null
    order by p.created_at desc,p.id desc offset (page_number-1)*page_size limit page_size
  ) rows;
  return jsonb_build_object('items',result_items,'total',total_count,'has_more',page_number*page_size<total_count);
end;
$$;

-- Restrictive policy closes Storage list/sign/download side channels as well as
-- the RPC path. Owners retain cleanup rights; staff retain internal moderation.
create or replace function private.may_read_anonymous_media_path(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    p_bucket not in ('community','communities') or public.is_wenitro_admin() or not exists (
      select 1 from public.tbl_community_posts p
      where p.is_anonymous and p.media_url in (p_name, 'media/communities/' || p_name)
        and p.user_id is distinct from public.get_current_app_user_id()
    )
  );
$$;
revoke all on function private.may_read_anonymous_media_path(text,text) from public,anon;
grant execute on function private.may_read_anonymous_media_path(text,text) to authenticated;
drop policy if exists anonymous_media_identity_guard on storage.objects;
create policy anonymous_media_identity_guard on storage.objects as restrictive
  for select to authenticated
  using(private.may_read_anonymous_media_path(bucket_id,name));

commit;
