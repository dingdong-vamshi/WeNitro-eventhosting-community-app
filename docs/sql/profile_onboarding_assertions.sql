-- NOT RUN: requires authorized MCP access after candidate migration is reviewed/applied.
-- Target klyjzbisgycegkkacbjw. Uses only existing rows; every write is rolled back.
begin;

do $$
begin
  if not (select relrowsecurity from pg_class where oid='public.tbl_users'::regclass) then
    raise exception 'tbl_users RLS is disabled';
  end if;
  if has_function_privilege('anon','public.check_onboarding_username(text)','execute')
     or has_function_privilege('anon','public.complete_my_onboarding(uuid,text,text,date,text)','execute') then
    raise exception 'Anonymous onboarding access is enabled';
  end if;
  if not exists(select 1 from pg_index where indrelid='public.tbl_users'::regclass and indisunique
      and pg_get_indexdef(indexrelid) like '%(auth_user_id)%') then
    raise exception 'Canonical Auth identity uniqueness is missing';
  end if;
end $$;

create temp table onboarding_qa_before on commit drop as
select id,auth_user_id,fullname,username,dob,gender,onboarding_completed from public.tbl_users;

-- Select an existing verified, active member with an already valid username.
-- No account is created and no user-facing data is fabricated.
select set_config('request.jwt.claim.sub',coalesce((select u.auth_user_id::text
  from public.tbl_users u join auth.users a on a.id=u.auth_user_id
  where u.is_active=1 and coalesce(u.is_delete,0)=0 and u.username~'^[a-zA-Z0-9_]{3,30}$'
    and char_length(btrim(u.fullname)) between 1 and 150
    and (a.email_confirmed_at is not null or a.phone_confirmed_at is not null)
  order by u.id limit 1),''),true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('wenitro.qa_reserved_username',coalesce((select username from public.tbl_users
  where auth_user_id is distinct from nullif(current_setting('request.jwt.claim.sub'),'')::uuid
    and username~'^[a-zA-Z0-9_]{3,30}$' order by id limit 1),''),true);
select set_config('wenitro.qa_other_identity',coalesce((select auth_user_id::text from public.tbl_users
  where auth_user_id is not null
    and auth_user_id<>nullif(current_setting('request.jwt.claim.sub'),'')::uuid
  order by id limit 1),''),true);

set local role authenticated;
do $$
declare own public.tbl_users; reserved text:=current_setting('wenitro.qa_reserved_username'); rejected boolean:=false;
begin
  if nullif(auth.uid()::text,'') is null then raise exception 'No existing eligible account for rollback test'; end if;
  select id,username,fullname,dob,gender,onboarding_completed
    into own.id,own.username,own.fullname,own.dob,own.gender,own.onboarding_completed
    from public.tbl_users where id=public.get_current_legacy_user_id();
  if not public.check_onboarding_username(own.username) then raise exception 'Own username is unavailable'; end if;
  if reserved<>'' and public.check_onboarding_username(reserved) then raise exception 'Another profile username is available'; end if;
  begin
    perform public.complete_my_onboarding(auth.uid(),own.fullname,own.username,current_date+1,null);
  exception when invalid_parameter_value then rejected:=true;
  end;
  if not rejected then raise exception 'Future date was accepted'; end if;
  rejected:=false;
  begin
    perform public.complete_my_onboarding(auth.uid(),own.fullname,own.username,null,'not_an_option');
  exception when invalid_parameter_value then rejected:=true;
  end;
  if not rejected then raise exception 'Invalid gender was accepted'; end if;
  rejected:=false;
  begin
    perform public.complete_my_onboarding(null,own.fullname,own.username,null,null);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'Missing expected identity was accepted'; end if;
  if nullif(current_setting('wenitro.qa_other_identity'),'') is not null then
    rejected:=false;
    begin
      perform public.complete_my_onboarding(current_setting('wenitro.qa_other_identity')::uuid,own.fullname,own.username,null,null);
    exception when insufficient_privilege then rejected:=true;
    end;
    if not rejected then raise exception 'Mismatched expected identity was accepted'; end if;
  end if;
  -- No invented date/gender: nullable existing profile details remain valid.
  perform public.complete_my_onboarding(auth.uid(),own.fullname,own.username,null,null);
  if not (select onboarding_completed from public.tbl_users where id=own.id) then
    raise exception 'Completion did not persist';
  end if;
end $$;
reset role;

do $$
begin
  if (select count(*) from public.tbl_users)<>(select count(*) from onboarding_qa_before) then
    raise exception 'Profile count changed';
  end if;
  if exists(select 1 from public.tbl_users u join onboarding_qa_before b using(id)
    where u.auth_user_id is distinct from b.auth_user_id) then
    raise exception 'Auth identity mapping changed';
  end if;
  if exists(select 1 from public.tbl_users u join onboarding_qa_before b using(id)
    where u.auth_user_id is distinct from auth.uid()
      and (u.fullname,u.username,u.dob,u.gender,u.onboarding_completed)
        is distinct from (b.fullname,b.username,b.dob,b.gender,b.onboarding_completed)) then
    raise exception 'Another profile was modified';
  end if;
end $$;
rollback;
