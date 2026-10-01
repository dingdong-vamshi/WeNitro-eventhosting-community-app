-- Align derived Trust Score with the Auth and Admin-reviewed verification sources.
do $$
declare original text; revised text;
begin
  select pg_get_functiondef('private.trust_score_for(integer)'::regprocedure) into original;
  revised := replace(original,
    'phone_ok:=auth_row.phone_confirmed_at is not null or exists(select 1 from public.tbl_user_verification v where v.user_id=p_user_id and v.phone_verified);',
    'phone_ok:=auth_row.phone_confirmed_at is not null;');
  revised := replace(revised,
    'v.user_id=p_user_id and v.live_photo_verified);',
    'v.user_id=p_user_id and v.live_photo_verified and v.status=''approved'');');
  if revised=original then raise exception 'Unexpected Trust Score contract; inspect before applying'; end if;
  execute revised;
end $$;
