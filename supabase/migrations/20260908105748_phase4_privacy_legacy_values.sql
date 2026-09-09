-- Preserve the established table values and constraints, normalize API aliases explicitly.
create or replace function public.update_user_privacy_settings(p_profile_visibility text default null,p_email_visibility text default null,p_phone_visibility text default null,p_message_visibility text default null,p_show_online_status boolean default null) returns public.tbl_user_privacy_settings language plpgsql security definer set search_path='' as $$
 declare me integer:=public.get_current_app_user_id(); r public.tbl_user_privacy_settings;
 begin
 if p_profile_visibility is not null and p_profile_visibility not in ('public','friends') then raise exception 'Profile audience must be public or friends'; end if;
 p_email_visibility:=case p_email_visibility when 'public' then 'everyone' when 'private' then 'none' else p_email_visibility end;
 p_phone_visibility:=case p_phone_visibility when 'public' then 'everyone' when 'private' then 'none' else p_phone_visibility end;
 if p_email_visibility is not null and p_email_visibility not in ('everyone','friends','none') then raise exception 'Invalid email audience'; end if;
 if p_phone_visibility is not null and p_phone_visibility not in ('everyone','friends','none') then raise exception 'Invalid phone audience'; end if;
 if p_message_visibility is not null and p_message_visibility not in ('everyone','friends','none') then raise exception 'Invalid messaging audience'; end if;
 insert into public.tbl_user_privacy_settings(user_id) values(me) on conflict(user_id) do nothing;
 update public.tbl_user_privacy_settings set profile_visibility=coalesce(p_profile_visibility,profile_visibility),email_visibility=coalesce(p_email_visibility,email_visibility),phone_visibility=coalesce(p_phone_visibility,phone_visibility),message_visibility=coalesce(p_message_visibility,message_visibility),show_online_status=coalesce(p_show_online_status,show_online_status),updated_at=now() where user_id=me returning * into r; return r;
 end;
$$;
create or replace function private.profile_contact(p_user_id integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare u public.tbl_users; s public.tbl_user_privacy_settings; own boolean; friend boolean;
 begin
 perform public.get_current_app_user_id();
 if not private.can_read_profile(p_user_id) then raise exception 'This profile is visible to Squad only' using errcode='42501'; end if;
 select * into u from public.tbl_users where id=p_user_id and is_active=1 and coalesce(is_delete,0)=0;
 if not found then raise exception 'Profile unavailable'; end if;
 select * into s from public.tbl_user_privacy_settings where user_id=p_user_id;
 own:=p_user_id=public.current_app_user_id(); friend:=private.in_squad(p_user_id);
 return jsonb_build_object('id',u.id,'username',u.username,'fullname',u.fullname,'profile_image',u.profile_image,'bio',u.bio,'is_verified',u.isverified=1,'email',case when own or coalesce(s.email_visibility,'friends')='everyone' or (coalesce(s.email_visibility,'friends')='friends' and friend) then u.email else null end,'phone',case when own or coalesce(s.phone_visibility,'friends')='everyone' or (coalesce(s.phone_visibility,'friends')='friends' and friend) then coalesce(u.phone_e164,u.countrycode||u.phonenumber::text) else null end,'can_message',private.may_message(p_user_id));
 end;
$$;
