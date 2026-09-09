-- Optional business capability; normal identity and existing payment ledger are preserved.
create table public.tbl_partner_profiles (
 user_id integer primary key references public.tbl_users(id) on delete cascade,
 business_name text not null default '' check(char_length(business_name)<=120),
 description text not null default '' check(char_length(description)<=1000),
 city text not null default '' check(char_length(city)<=120),
 status text not null default 'draft' check(status in ('draft','pending','active','suspended','rejected')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint partner_active_name check(status<>'active' or char_length(btrim(business_name))>=2)
);
alter table public.tbl_partner_profiles enable row level security;
revoke all on public.tbl_partner_profiles from public,anon,authenticated;
grant select on public.tbl_partner_profiles to authenticated;
grant all on public.tbl_partner_profiles to service_role;
create policy partner_profile_owner_read on public.tbl_partner_profiles for select to authenticated using(user_id=public.get_current_app_user_id() or public.is_wenitro_admin());
comment on column public.tbl_users.account_type is 'Compatibility projection of active optional Partner capability. All identities remain normal WeNitro users. Authorization uses tbl_partner_profiles.';

create function private.partner_eligible(p_user_id integer) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tbl_users u join auth.users a on a.id=u.auth_user_id where u.id=p_user_id and u.is_active=1 and coalesce(u.is_delete,0)=0 and (a.email_confirmed_at is not null or a.phone_confirmed_at is not null))
$$;
create function private.has_active_partner(p_user_id integer) returns boolean language sql stable security definer set search_path='' as $$
 select private.partner_eligible(p_user_id) and exists(select 1 from public.tbl_partner_profiles p where p.user_id=p_user_id and p.status='active')
$$;
-- Migrate only explicitly selected legacy Partners, never ordinary existing users.
insert into public.tbl_partner_profiles(user_id,business_name,status)
select id,left(case when char_length(btrim(fullname))>=2 then btrim(fullname) when char_length(btrim(username))>=2 then btrim(username) else 'Partner' end,120),case when private.partner_eligible(id) then 'active' else 'draft' end from public.tbl_users where account_type='partner';

create function private.sync_partner_capability() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.tbl_users set account_type=case when tg_op<>'DELETE' and new.status='active' then 'partner' else 'individual' end where id=coalesce(new.user_id,old.user_id);
 return null;
end $$;
create trigger sync_partner_capability after insert or update or delete on public.tbl_partner_profiles for each row execute function private.sync_partner_capability();
update public.tbl_users u set account_type=case when exists(select 1 from public.tbl_partner_profiles p where p.user_id=u.id and p.status='active') then 'partner' else 'individual' end where u.account_type='partner';

create function private.get_my_partner_profile() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); profile jsonb;
begin
 if auth.uid() is null or me is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select to_jsonb(p) into profile from public.tbl_partner_profiles p where p.user_id=me;
 return jsonb_build_object('profile',profile,'eligible',private.partner_eligible(me));
end $$;
create function public.get_my_partner_profile() returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_my_partner_profile() $$;
create function private.save_my_partner_profile(p_business_name text,p_description text default '',p_city text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); current_status text;
begin
 if auth.uid() is null or not private.partner_eligible(me) then raise exception 'Verify your email or phone before becoming a Partner' using errcode='42501'; end if;
 if p_business_name is null or char_length(btrim(p_business_name)) not between 2 and 120 or char_length(coalesce(p_description,''))>1000 or char_length(coalesce(p_city,''))>120 then raise exception 'Provide a business name (2–120 characters), description up to 1000 and city up to 120 characters' using errcode='22023'; end if;
 -- One lock per normal identity also serializes first-time onboarding retries.
 perform 1 from public.tbl_users where id=me for update;
 if not private.partner_eligible(me) then raise exception 'Verify your email or phone before becoming a Partner' using errcode='42501'; end if;
 select status into current_status from public.tbl_partner_profiles where user_id=me for update;
 if current_status in ('suspended','rejected') then raise exception 'Partner capability is unavailable for this profile' using errcode='42501'; end if;
 insert into public.tbl_partner_profiles(user_id,business_name,description,city,status) values(me,btrim(p_business_name),btrim(coalesce(p_description,'')),btrim(coalesce(p_city,'')),'active')
 on conflict(user_id) do update set business_name=excluded.business_name,description=excluded.description,city=excluded.city,status='active',updated_at=now();
 return private.get_my_partner_profile();
end $$;
create function public.save_my_partner_profile(p_business_name text,p_description text default '',p_city text default '') returns jsonb language sql security invoker set search_path='' as $$ select private.save_my_partner_profile(p_business_name,p_description,p_city) $$;

create or replace function private.partner_owns_activity(p_event_id integer) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.has_active_partner(public.get_current_app_user_id()) and exists(select 1 from public.tbl_events e where e.id=p_event_id and e.created_by=public.get_current_app_user_id())
$$;

create function private.enforce_partner_paid_hosting() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Grandfather unchanged existing paid listings: participants may still pay, and
 -- hosts may manage/cancel them. New paid listings and price/host changes require capability.
 if coalesce(new.is_paid,false) or coalesce(new.price,0)>0 then
  if tg_op='UPDATE' then
   if new.is_paid is not distinct from old.is_paid and new.price is not distinct from old.price and new.created_by is not distinct from old.created_by then return new; end if;
  end if;
  if not private.has_active_partner(new.created_by) then raise exception 'Become a Partner to host paid activities' using errcode='42501'; end if;
 end if;
 return new;
end $$;
create trigger enforce_partner_paid_hosting before insert or update on public.tbl_events for each row execute function private.enforce_partner_paid_hosting();

create function private.get_partner_transactions(p_event_id integer default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); result jsonb;
begin
 if auth.uid() is null or not private.has_active_partner(me) then raise exception 'Partner account required' using errcode='42501'; end if;
 if p_event_id is not null and not private.partner_owns_activity(p_event_id) then raise exception 'Activity ownership required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('payment_id',p.id::text,'event_id',e.id,'activity_title',e.title,'display_name',u.fullname,'paid_at',p.paid_at,'amount_paisa',p.amount_paisa,'platform_fee_bps',p.platform_fee_bps,'platform_fee_paisa',p.platform_fee_paisa,'partner_net_paisa',p.partner_net_paisa) order by p.paid_at desc),'[]') into result
 from public.tbl_activity_payments p join public.tbl_events e on e.id=p.event_id join public.tbl_users u on u.id=p.user_id
 where e.created_by=me and (p_event_id is null or e.id=p_event_id) and p.status='paid' and p.last_verified_at is not null and p.paid_at is not null and p.provider_status in ('PAID','SUCCESS');
 return result;
end $$;
create function public.get_partner_transactions(p_event_id integer default null) returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_partner_transactions(p_event_id) $$;

revoke all on function private.partner_eligible(integer),private.has_active_partner(integer),private.sync_partner_capability(),private.enforce_partner_paid_hosting() from public,anon,authenticated;
revoke all on function private.get_my_partner_profile(),private.save_my_partner_profile(text,text,text),private.get_partner_transactions(integer),public.get_my_partner_profile(),public.save_my_partner_profile(text,text,text),public.get_partner_transactions(integer) from public,anon;
grant execute on function private.get_my_partner_profile(),private.save_my_partner_profile(text,text,text),private.get_partner_transactions(integer),public.get_my_partner_profile(),public.save_my_partner_profile(text,text,text),public.get_partner_transactions(integer) to authenticated;

create or replace function private.get_partner_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); activities jsonb; summary jsonb;
begin
 if auth.uid() is null or not private.has_active_partner(me) then raise exception 'Partner account required' using errcode='42501'; end if;
 with counts as (
 select e.id,e.title,e.event_start_time,e.price,e.status,e.visibility_type,e.max_participants capacity,
 case when e.max_participants is null then null else greatest(0,e.max_participants-(select count(*) from public.tbl_event_participants p where p.event_id=e.id and p.status in ('approved','going','payment_required'))) end remaining_slots,
 (select count(*) from public.tbl_event_participants p where p.event_id=e.id and p.status<>'left') registration_count,
 (select count(*) from public.tbl_event_participants p where p.event_id=e.id and p.status='pending') pending_count,
 (select count(*) from public.tbl_event_participants p where p.event_id=e.id and p.status='approved') approved_count,
 (select count(*) from public.tbl_event_participants p where p.event_id=e.id and p.status='rejected') rejected_count,
 (select count(distinct p.user_id) from public.tbl_activity_payments p where p.event_id=e.id and p.status='paid' and p.last_verified_at is not null and p.paid_at is not null and p.provider_status in ('PAID','SUCCESS')) paid_registration_count,
 coalesce((select sum(p.amount_paisa) from public.tbl_activity_payments p where p.event_id=e.id and p.status='paid' and p.last_verified_at is not null and p.paid_at is not null and p.provider_status in ('PAID','SUCCESS')),0) gross_paisa,
 coalesce((select sum(p.platform_fee_paisa) from public.tbl_activity_payments p where p.event_id=e.id and p.status='paid' and p.last_verified_at is not null and p.paid_at is not null and p.provider_status in ('PAID','SUCCESS')),0) platform_fee_paisa,
 coalesce((select sum(p.partner_net_paisa) from public.tbl_activity_payments p where p.event_id=e.id and p.status='paid' and p.last_verified_at is not null and p.paid_at is not null and p.provider_status in ('PAID','SUCCESS')),0) net_paisa
 from public.tbl_events e where e.created_by=me
 )
 select coalesce(jsonb_agg(jsonb_build_object('event_id',id,'title',title,'capacity',capacity,'remaining_slots',remaining_slots,'starts_at',event_start_time,'price_inr',price,'status',status,'visibility',visibility_type,'registration_count',registration_count,'pending_count',pending_count,'approved_count',approved_count,'rejected_count',rejected_count,'paid_registration_count',paid_registration_count,'gross_paisa',gross_paisa,'platform_fee_paisa',platform_fee_paisa,'net_paisa',net_paisa) order by event_start_time desc),'[]'),
 jsonb_build_object('hosted_activities',count(*),'total_registrations',coalesce(sum(registration_count),0),'paid_registrations',coalesce(sum(paid_registration_count),0),'pending_registrations',coalesce(sum(pending_count),0),'approved_registrations',coalesce(sum(approved_count),0),'rejected_registrations',coalesce(sum(rejected_count),0),'gross_paisa',coalesce(sum(gross_paisa),0),'platform_fee_paisa',coalesce(sum(platform_fee_paisa),0),'net_paisa',coalesce(sum(net_paisa),0),'platform_fee_bps',private.platform_fee_bps()) into activities,summary from counts;
 return jsonb_build_object('summary',summary,'activities',activities);
end $$;

create or replace function private.get_partner_registrations(p_event_id integer default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); result jsonb;
begin
 if auth.uid() is null or not private.has_active_partner(me) then raise exception 'Partner account required' using errcode='42501'; end if;
 if p_event_id is not null and not private.partner_owns_activity(p_event_id) then raise exception 'Activity ownership required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('participant_id',r.id,'user_id',r.user_id,'event_id',e.id,'activity_title',e.title,'display_name',u.fullname,'status',r.status,'payment_status',case when paid.amount>0 then 'paid' when not e.is_paid then 'free' else coalesce(latest.status,'unpaid') end,'amount_paid_paisa',coalesce(paid.amount,0),'registered_at',r.created_at,'answers',(select coalesce(jsonb_agg(jsonb_build_object('question_id',q.id,'label',q.label,'value',a.value) order by q.display_order),'[]') from public.tbl_activity_registration_answers a join public.tbl_activity_registration_questions q on q.id=a.question_id where a.event_id=e.id and a.user_id=r.user_id)) order by r.created_at desc),'[]') into result
 from public.tbl_event_participants r join public.tbl_events e on e.id=r.event_id join public.tbl_users u on u.id=r.user_id
 left join lateral(select sum(p.amount_paisa) amount from public.tbl_activity_payments p where p.event_id=e.id and p.user_id=r.user_id and p.status='paid' and p.last_verified_at is not null and p.paid_at is not null and p.provider_status in ('PAID','SUCCESS')) paid on true
 left join lateral(select p.status from public.tbl_activity_payments p where p.event_id=e.id and p.user_id=r.user_id order by p.created_at desc limit 1) latest on true
 where e.created_by=me and (p_event_id is null or e.id=p_event_id) and r.status<>'left';
 return result;
end $$;

CREATE OR REPLACE FUNCTION private.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth_user_id integer;
  v_email_user_id integer;
  v_phone_user_id integer;
  v_user_id integer;
  v_email_matches bigint := 0;
  v_phone_matches bigint := 0;
  v_existing_auth_user_id uuid;
  v_email text;
  v_phone text;
  v_storage_email text;
  v_metadata_full_name text;
  v_full_name text;
  v_username_seed text;
  v_username_base text;
  v_username text;
  v_uuid_suffix text;
  v_username_attempt integer := 0;
  v_countrycode text;
  v_national_phone bigint;
begin
  v_email := nullif(lower(btrim(new.email)), '');
  v_phone := private.normalize_phone_e164(new.phone);
  v_metadata_full_name := nullif(
    btrim(
      coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'fullname',
        new.raw_user_meta_data ->> 'name',
        ''
      )
    ),
    ''
  );

  select u.id
    into v_auth_user_id
    from public.tbl_users u
    where u.auth_user_id = new.id
    limit 1;

  if v_email is not null then
    select min(u.id), count(*)
    into v_email_user_id, v_email_matches
    from public.tbl_users u
    where lower(btrim(u.email)) = v_email;

    if v_email_matches > 1 then
      raise exception 'Email matches multiple legacy accounts' using errcode = '23505';
    end if;
  end if;

  if v_phone is not null then
    select min(u.id), count(*)
    into v_phone_user_id, v_phone_matches
    from public.tbl_users u
    where u.phone_e164 = v_phone
       or (
         u.phone_e164 is null
         and private.normalize_phone_e164(
           coalesce(u.countrycode, '') ||
           coalesce(u.phonenumber::text, '')
         ) = v_phone
       );

    if v_phone_matches > 1 then
      raise exception 'Phone matches multiple legacy accounts' using errcode = '23505';
    end if;
  end if;

  if v_email_user_id is not null
     and v_phone_user_id is not null
     and v_email_user_id <> v_phone_user_id then
    raise exception 'Email and phone belong to different legacy accounts' using errcode = '23505';
  end if;

  if v_auth_user_id is not null
     and v_email_user_id is not null
     and v_auth_user_id <> v_email_user_id then
    raise exception 'Auth user and email map to different legacy accounts' using errcode = '23505';
  end if;

  if v_auth_user_id is not null
     and v_phone_user_id is not null
     and v_auth_user_id <> v_phone_user_id then
    raise exception 'Auth user and phone map to different legacy accounts' using errcode = '23505';
  end if;

  v_user_id := coalesce(v_auth_user_id, v_email_user_id, v_phone_user_id);

  if v_phone ~ '^\+91[6-9][0-9]{9}$' then
    v_countrycode := '+91';
    v_national_phone := substring(v_phone from 4)::bigint;
  end if;

  if v_user_id is not null then
    perform 1
    from public.tbl_users u
    where u.id = v_user_id
    for update;

    select u.auth_user_id
    into v_existing_auth_user_id
    from public.tbl_users u
    where u.id = v_user_id;

    if v_existing_auth_user_id is not null
       and v_existing_auth_user_id <> new.id then
      raise exception 'Legacy account is already linked to another auth user' using errcode = '23505';
    end if;

    update public.tbl_users
    set
      auth_user_id = new.id,
      is_active = 1,
      is_delete = 0,
      fullname = case
        when v_metadata_full_name is not null then left(v_metadata_full_name, 150)
        else fullname
      end,
      phone_e164 = case
        when v_phone is not null then v_phone
        else phone_e164
      end,
      countrycode = case
        when v_countrycode is not null then v_countrycode
        else countrycode
      end,
      phonenumber = case
        when v_national_phone is not null then v_national_phone
        else phonenumber
      end
    where id = v_user_id;
  else
    v_uuid_suffix := left(replace(new.id::text, '-', ''), 12);
    v_username_seed := coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      case when v_email is not null then split_part(v_email, '@', 1) end,
      'member'
    );
    v_username_base := lower(
      regexp_replace(btrim(v_username_seed), '[^a-zA-Z0-9_]+', '_', 'g')
    );
    v_username_base := btrim(v_username_base, '_');

    if v_username_base = '' then
      v_username_base := 'member';
    end if;

    -- Serialize bridge-generated username selection so concurrent signups cannot
    -- choose the same case-insensitive username.
    perform pg_advisory_xact_lock(
      hashtext('wenitro:auth-bridge:username')
    );

    loop
      v_username := left(v_username_base, 80) || '_' || v_uuid_suffix;
      if v_username_attempt > 0 then
        v_username := left(v_username_base, 74) || '_' ||
          v_uuid_suffix || '_' || v_username_attempt::text;
      end if;
      v_username := left(v_username, 100);

      exit when not exists (
        select 1
        from public.tbl_users u
        where lower(u.username) = lower(v_username)
      );

      v_username_attempt := v_username_attempt + 1;
      if v_username_attempt > 100 then
        raise exception 'Unable to allocate a unique username' using errcode = '23505';
      end if;
    end loop;

    v_full_name := left(
      coalesce(
        v_metadata_full_name,
        case when v_email is not null then split_part(v_email, '@', 1) end,
        'WeNitro member'
      ),
      150
    );

    v_storage_email := coalesce(
      v_email,
      'auth-phone-' || replace(new.id::text, '-', '') || '@invalid.wenitro.local'
    );

    insert into public.tbl_users (
      username,
      fullname,
      email,
      password,
      is_active,
      is_delete,
      auth_user_id,
      phone_e164,
      countrycode,
      phonenumber,
      account_type
    )
    values (
      v_username,
      v_full_name,
      v_storage_email,
      'supabase-auth-managed',
      1,
      0,
      new.id,
      v_phone,
      v_countrycode,
      v_national_phone,
      'individual'
    )
    returning id into v_user_id;
    -- Signup intent initializes optional onboarding only; never grants authority.
    if new.raw_user_meta_data->>'account_type' = 'partner' then
      insert into public.tbl_partner_profiles(user_id,status) values(v_user_id,'draft') on conflict(user_id) do nothing;
    end if;
  end if;

  insert into public.tbl_user_privacy_settings(user_id)
  values (v_user_id)
  on conflict(user_id) do nothing;

  return new;
end
$function$;


notify pgrst,'reload schema';
