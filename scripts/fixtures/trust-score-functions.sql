-- Read-only target definitions captured 2026-10-03 for independent score tests.
CREATE OR REPLACE FUNCTION private.sync_verification_rewards(p_auth_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION private.trust_score_for(p_user_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.tbl_users; auth_row auth.users; email_ok boolean:=false; phone_ok boolean:=false; selfie_ok boolean:=false; aadhaar_ok boolean:=false; social_ok boolean:=false; joined_count integer:=0; rating_value numeric:=0; total_value integer:=0;
begin
  select * into target from public.tbl_users where id=p_user_id and is_active=1 and coalesce(is_delete,0)=0;
  if target.id is null then raise exception 'Profile unavailable'; end if;
  select * into auth_row from auth.users where id=target.auth_user_id;
  email_ok:=auth_row.email_confirmed_at is not null;
  phone_ok:=auth_row.phone_confirmed_at is not null;
  selfie_ok:=exists(select 1 from public.tbl_user_verification v where v.user_id=p_user_id and v.live_photo_verified and v.status='approved');
  aadhaar_ok:=exists(select 1 from public.tbl_user_verification v where v.user_id=p_user_id and v.aadhaar_verified and v.status='approved');
  social_ok:=exists(select 1 from public.tbl_user_social_links l where l.user_id=p_user_id and coalesce(nullif(l.instagram,''),nullif(l.facebook,''),nullif(l.twitter,''),nullif(l.linkedin,''),nullif(l.youtube,'')) is not null);
  rating_value:=coalesce(target.rating,0);
  select count(distinct p.event_id) into joined_count from public.tbl_event_participants p join public.tbl_events e on e.id=p.event_id where p.user_id=p_user_id and p.status in ('approved','going','paid') and not coalesce(e.is_deleted,false) and not coalesce(e.is_cancelled,false);
  total_value:=(case when email_ok then 10 else 0 end)+(case when phone_ok then 10 else 0 end)+(case when selfie_ok then 10 else 0 end)+(case when aadhaar_ok then 20 else 0 end)+(case when social_ok then 10 else 0 end)+(case when rating_value>=4 then 10 else 0 end)+(case when joined_count>=20 then 30 when joined_count>=10 then 20 else 0 end);
  return jsonb_build_object('total',least(total_value,100),'email_verified',email_ok,'phone_verified',phone_ok,'selfie_verified',selfie_ok,'aadhaar_verified',aadhaar_ok,'social_linked',social_ok,'rating',rating_value,'activities_joined',joined_count);
end
$function$
;
CREATE OR REPLACE FUNCTION public.my_trust_score()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select private.trust_score_for(public.get_current_app_user_id()) $function$
;
CREATE OR REPLACE FUNCTION public.profile_trust_score(p_user_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare score jsonb;
begin
  if not private.can_read_profile(p_user_id) then raise exception 'This profile is visible to Squad only' using errcode='42501'; end if;
  score:=private.trust_score_for(p_user_id);
  return jsonb_build_object('total',score->'total','rating',score->'rating','activities_joined',score->'activities_joined');
end
$function$
;
