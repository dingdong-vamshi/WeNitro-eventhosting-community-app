-- Backward-compatible link IDs alongside the existing community-name array.
-- Uses the same profile guard and community visibility predicate as profile_contact.
create or replace function private.profile_contact(p_user_id integer)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.tbl_users; s public.tbl_user_privacy_settings; own boolean; friend boolean;
begin
  perform public.get_current_app_user_id();
  if not private.can_read_profile(p_user_id) then raise exception 'This profile is visible to Squad only' using errcode='42501'; end if;
  select * into u from public.tbl_users where id=p_user_id and is_active=1 and coalesce(is_delete,0)=0;
  if not found then raise exception 'Profile unavailable'; end if;
  select * into s from public.tbl_user_privacy_settings where user_id=p_user_id;
  own:=p_user_id=public.current_app_user_id(); friend:=private.in_squad(p_user_id);
  return jsonb_build_object(
    'id',u.id,'username',u.username,'fullname',u.fullname,'profile_image',u.profile_image,
    'bio',u.bio,'about',coalesce(u.about,u.bio),'location',u.nationality,'is_verified',u.isverified=1,
    'email',case when own or coalesce(s.email_visibility,'friends')='everyone' or (coalesce(s.email_visibility,'friends')='friends' and friend) then u.email else null end,
    'phone',case when own or coalesce(s.phone_visibility,'friends')='everyone' or (coalesce(s.phone_visibility,'friends')='friends' and friend) then coalesce(u.phone_e164,u.countrycode||u.phonenumber::text) else null end,
    'can_message',private.may_message(p_user_id),
    'social_links',(select jsonb_build_object('instagram',l.instagram,'facebook',l.facebook,'twitter',l.twitter,'linkedin',l.linkedin,'youtube',l.youtube) from public.tbl_user_social_links l where l.user_id=p_user_id order by l.id limit 1),
    'interests',coalesce((select jsonb_agg(c.name order by c.name) from public.tbl_user_interests i join public.tbl_categories c on c.id=i.category_id where i.user_id=p_user_id),'[]'::jsonb),
    'communities',coalesce((select jsonb_agg(r.title order by r.title) from public.tbl_chat_participants cp join public.tbl_chat_rooms r on r.id=cp.room_id where cp.user_id=p_user_id and r.room_type='community' and (r.visibility='public' or own)),'[]'::jsonb),
    'community_links',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.title) order by r.title,r.id) from public.tbl_chat_participants cp join public.tbl_chat_rooms r on r.id=cp.room_id where cp.user_id=p_user_id and r.room_type='community' and (r.visibility='public' or own)),'[]'::jsonb)
  );
end
$$;
