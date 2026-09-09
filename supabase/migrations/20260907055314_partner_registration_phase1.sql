-- Partner Phase 1 extends the inspected legacy integer-ID schema.
-- Fee accounting excludes gateway fees and taxes; this is not settlement.
alter table public.tbl_users add column account_type text not null default 'individual' check(account_type in ('individual','partner'));
grant select(account_type) on public.tbl_users to authenticated;

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
      case when new.raw_user_meta_data->>'account_type' = 'partner' then 'partner' else 'individual' end
    )
    returning id into v_user_id;
  end if;

  insert into public.tbl_user_privacy_settings(user_id)
  values (v_user_id)
  on conflict(user_id) do nothing;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.get_my_profile()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', u.id,
    'account_type', u.account_type,
    'username', u.username,
    'fullname', u.fullname,
    'email', u.email,
    'bio', u.bio,
    'about', u.about,
    'dob', u.dob,
    'gender', u.gender,
    'nationality', u.nationality,
    'occupation', u.occupation,
    'profile_image', u.profile_image,
    'rating', u.rating,
    'points', u.points,
    'isverified', u.isverified,
    'create_at', u.create_at
  )
  from public.tbl_users u
  where u.id = public.get_current_app_user_id()
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_wenitro_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select jsonb_build_object(
    'id', u.id,
    'account_type', u.account_type,
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
$function$;

create table public.tbl_activity_registration_questions (
 id bigint generated by default as identity primary key,
 event_id integer not null references public.tbl_events(id) on delete cascade,
 label text not null check(length(btrim(label)) between 1 and 240),
 type text not null check(type in ('short_text','long_text','single_choice','multiple_choice','checkbox')),
 required boolean not null default false,
 display_order integer not null check(display_order between 0 and 19),
 options jsonb not null default '[]'::jsonb check(jsonb_typeof(options)='array'),
 unique(event_id,id), unique(event_id,display_order) deferrable initially deferred
);
create table public.tbl_activity_registration_answers (
 event_id integer not null,
 question_id bigint not null,
 user_id integer not null references public.tbl_users(id) on delete cascade,
 value jsonb not null,
 created_at timestamptz not null default now(),
 primary key(question_id,user_id),
 foreign key(event_id,question_id) references public.tbl_activity_registration_questions(event_id,id) on delete cascade
);
create index registration_answers_event_user on public.tbl_activity_registration_answers(event_id,user_id);
create index registration_answers_user on public.tbl_activity_registration_answers(user_id);
alter table public.tbl_activity_registration_questions enable row level security;
alter table public.tbl_activity_registration_answers enable row level security;
revoke all on public.tbl_activity_registration_questions,public.tbl_activity_registration_answers from public,anon,authenticated;
grant select on public.tbl_activity_registration_questions,public.tbl_activity_registration_answers to authenticated;
grant all on public.tbl_activity_registration_questions,public.tbl_activity_registration_answers to service_role;
grant usage,select on sequence public.tbl_activity_registration_questions_id_seq to service_role;

-- Helpers live outside the exposed schema; identity is always resolved server-side.
create function private.partner_owns_activity(p_event_id integer) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.tbl_events e join public.tbl_users u on u.id=e.created_by where e.id=p_event_id and u.id=public.get_current_app_user_id() and u.account_type='partner' and u.is_active=1 and coalesce(u.is_delete,0)=0)
$$;
create function private.registration_event_visible(p_event_id integer) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.tbl_events e where e.id=p_event_id and not coalesce(e.is_deleted,false) and (e.created_by=public.get_current_app_user_id() or (e.status='published' and (e.visibility_type='public' or exists(select 1 from public.tbl_event_participants p where p.event_id=e.id and p.user_id=public.get_current_app_user_id() and p.status not in ('left','rejected'))))))
$$;
revoke all on function private.partner_owns_activity(integer),private.registration_event_visible(integer) from public,anon;
grant execute on function private.partner_owns_activity(integer),private.registration_event_visible(integer) to authenticated;
create policy registration_questions_read on public.tbl_activity_registration_questions for select to authenticated using(private.registration_event_visible(event_id));
create policy registration_answers_private on public.tbl_activity_registration_answers for select to authenticated using(user_id=public.get_current_app_user_id() or private.partner_owns_activity(event_id) or public.is_wenitro_admin());

create function private.save_activity_registration_questions(p_event_id integer,p_questions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb; idx integer:=0; qid bigint; seen bigint[]:='{}'; locked boolean; existing jsonb;
begin
 if not private.partner_owns_activity(p_event_id) then raise exception 'Partner activity ownership required' using errcode='42501'; end if;
 perform 1 from public.tbl_events where id=p_event_id for update;
 if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions)>20 then raise exception 'Use at most 20 registration questions'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'type',type,'required',required,'display_order',display_order,'options',options) order by display_order),'[]') into existing from public.tbl_activity_registration_questions where event_id=p_event_id;
 select exists(select 1 from public.tbl_activity_registration_answers where event_id=p_event_id) or exists(select 1 from public.tbl_event_participants where event_id=p_event_id) into locked;
 if locked then
  if existing=p_questions then return existing; end if;
  raise exception 'Registration form is locked after the first registration';
 end if;
 for q in select value from jsonb_array_elements(p_questions) loop
  if jsonb_typeof(q) is distinct from 'object' or length(btrim(coalesce(q->>'label',''))) not between 1 and 240 or coalesce(q->>'type','') not in ('short_text','long_text','single_choice','multiple_choice','checkbox') or jsonb_typeof(q->'required') is distinct from 'boolean' then raise exception 'Invalid registration question'; end if;
  if jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options')>30 then raise exception 'Invalid question options'; end if;
  if exists(select 1 from jsonb_array_elements(q->'options') o where jsonb_typeof(o) <> 'string' or length(btrim(o#>>'{}')) not between 1 and 160) then raise exception 'Options must be nonempty text'; end if;
  if (select count(*) from jsonb_array_elements(q->'options')) <> (select count(distinct value) from jsonb_array_elements(q->'options')) then raise exception 'Question options must be unique'; end if;
  if q->>'type' in ('single_choice','multiple_choice') and jsonb_array_length(q->'options')<2 then raise exception 'Choice questions need at least two options'; end if;
  if q->>'type' not in ('single_choice','multiple_choice') and jsonb_array_length(q->'options')<>0 then raise exception 'Only choice questions accept options'; end if;
  qid:=nullif(q->>'id','')::bigint;
  if qid is not null then
   if qid=any(seen) or not exists(select 1 from public.tbl_activity_registration_questions where id=qid and event_id=p_event_id) then raise exception 'Invalid question ownership or duplicate'; end if;
   update public.tbl_activity_registration_questions set label=btrim(q->>'label'),type=q->>'type',required=(q->>'required')::boolean,display_order=idx,options=q->'options' where id=qid and event_id=p_event_id;
  else
   insert into public.tbl_activity_registration_questions(event_id,label,type,required,display_order,options) values(p_event_id,btrim(q->>'label'),q->>'type',(q->>'required')::boolean,idx,q->'options') returning id into qid;
  end if;
  seen:=array_append(seen,qid); idx:=idx+1;
 end loop;
 delete from public.tbl_activity_registration_questions where event_id=p_event_id and not(id=any(seen));
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'type',type,'required',required,'display_order',display_order,'options',options) order by display_order),'[]') from public.tbl_activity_registration_questions where event_id=p_event_id);
end $$;
create function public.save_activity_registration_questions(p_event_id integer,p_questions jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.save_activity_registration_questions(p_event_id,p_questions) $$;

create function private.get_activity_registration_form(p_event_id integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.registration_event_visible(p_event_id) then raise exception 'Activity unavailable' using errcode='42501'; end if;
 return jsonb_build_object('questions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'type',type,'required',required,'display_order',display_order,'options',options) order by display_order),'[]') from public.tbl_activity_registration_questions where event_id=p_event_id),'answers',(select coalesce(jsonb_agg(jsonb_build_object('question_id',question_id,'value',value)),'[]') from public.tbl_activity_registration_answers where event_id=p_event_id and user_id=public.get_current_app_user_id()),'locked',exists(select 1 from public.tbl_activity_registration_answers where event_id=p_event_id) or exists(select 1 from public.tbl_event_participants where event_id=p_event_id));
end $$;
create function public.get_activity_registration_form(p_event_id integer) returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_activity_registration_form(p_event_id) $$;

-- Called by both the existing participation and Cashfree prepare RPCs, so an old
-- client cannot bypass required answers by skipping the new screen.
create function private.assert_registration_complete(p_event_id integer,p_user_id integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_user_id is distinct from public.get_current_app_user_id() or not private.registration_event_visible(p_event_id) then raise exception 'Activity access required' using errcode='42501'; end if;
 if exists(select 1 from public.tbl_activity_registration_questions q where q.event_id=p_event_id and q.required and not exists(select 1 from public.tbl_activity_registration_answers a where a.question_id=q.id and a.user_id=p_user_id)) then raise exception 'Complete the required registration questions first'; end if;
end $$;

create function private.submit_activity_registration(p_event_id integer,p_answers jsonb,p_status text default 'going') returns public.tbl_event_participants
language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); q public.tbl_activity_registration_questions; a jsonb; v jsonb; result public.tbl_event_participants; state text;
begin
 if auth.uid() is null or me is null or not private.registration_event_visible(p_event_id) then raise exception 'Activity access required' using errcode='42501'; end if;
 perform 1 from public.tbl_events where id=p_event_id for update;
 if p_status not in ('going','interested','waitlist') then raise exception 'Invalid registration status'; end if;
 if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers)>20 then raise exception 'Invalid registration answers'; end if;
 if exists(select 1 from jsonb_array_elements(p_answers) x where jsonb_typeof(x) is distinct from 'object' or not exists(select 1 from public.tbl_activity_registration_questions t where t.event_id=p_event_id and t.id::text=x->>'question_id')) then raise exception 'Answer contains an unknown question'; end if;
 if (select count(*) from jsonb_array_elements(p_answers)) <> (select count(distinct x->>'question_id') from jsonb_array_elements(p_answers) x) then raise exception 'Duplicate question answers'; end if;
 select status into state from public.tbl_event_participants where event_id=p_event_id and user_id=me;
 if state in ('approved','payment_required') then
  -- Idempotent retry preserves the already locked answers; never rewrites them.
  select * into result from public.tbl_event_participants where event_id=p_event_id and user_id=me; return result;
 end if;
 delete from public.tbl_activity_registration_answers where event_id=p_event_id and user_id=me;
 for q in select * from public.tbl_activity_registration_questions where event_id=p_event_id order by display_order loop
  select x into a from jsonb_array_elements(p_answers) x where x->>'question_id'=q.id::text;
  v:=a->'value';
  if v is null or v='null'::jsonb or v='""'::jsonb or v='[]'::jsonb or (q.type='checkbox' and v='false'::jsonb) then
   if q.required then raise exception 'Required answer missing: %',q.label; end if;
   continue;
  end if;
  if q.type in ('short_text','long_text') then
   if jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}'))<1 or length(v#>>'{}')>(case when q.type='short_text' then 500 else 4000 end) then raise exception 'Invalid text answer: %',q.label; end if;
   v:=to_jsonb(btrim(v#>>'{}'));
  elsif q.type='single_choice' then
   if jsonb_typeof(v)<>'string' or not(q.options @> jsonb_build_array(v)) then raise exception 'Choose a valid option: %',q.label; end if;
  elsif q.type='multiple_choice' then
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>30 then raise exception 'Invalid multiple choice answer'; end if;
   if exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x)<>'string' or not(q.options @> jsonb_build_array(x))) or (select count(*) from jsonb_array_elements(v))<>(select count(distinct value) from jsonb_array_elements(v)) then raise exception 'Choose valid unique options'; end if;
  elsif q.type='checkbox' and jsonb_typeof(v)<>'boolean' then raise exception 'Agreement must be checked or unchecked';
  end if;
  insert into public.tbl_activity_registration_answers(event_id,question_id,user_id,value) values(p_event_id,q.id,me,v);
 end loop;
 result:=public.request_join_activity(p_event_id,p_status);
 return result;
end $$;
create function public.submit_activity_registration(p_event_id integer,p_answers jsonb,p_status text default 'going') returns public.tbl_event_participants language sql security invoker set search_path='' as $$ select private.submit_activity_registration(p_event_id,p_answers,p_status) $$;

-- The server is the sole fee authority. Snapshot once when provider confirmation
-- makes a payment paid; round each payment fee to the nearest paisa, then sum.
create function private.platform_fee_bps() returns integer language sql immutable set search_path='' as $$ select 500 $$;
alter table public.tbl_activity_payments add column platform_fee_bps integer,
 add column platform_fee_paisa bigint, add column partner_net_paisa bigint,
 add constraint payment_fee_snapshot_valid check ((platform_fee_bps is null and platform_fee_paisa is null and partner_net_paisa is null) or (platform_fee_bps is not null and platform_fee_paisa is not null and partner_net_paisa is not null and platform_fee_bps between 0 and 10000 and platform_fee_paisa>=0 and partner_net_paisa>=0 and platform_fee_paisa+partner_net_paisa=amount_paisa));
create function private.snapshot_activity_payment_fee() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and old.status='paid' then
  if new.amount_paisa is distinct from old.amount_paisa or new.platform_fee_bps is distinct from old.platform_fee_bps or new.platform_fee_paisa is distinct from old.platform_fee_paisa or new.partner_net_paisa is distinct from old.partner_net_paisa then raise exception 'Confirmed payment accounting is immutable'; end if;
 elsif new.status='paid' then
  if new.last_verified_at is null or new.paid_at is null or (new.provider_status is null or new.provider_status not in ('PAID','SUCCESS')) then raise exception 'Provider verification required'; end if;
  new.platform_fee_bps:=private.platform_fee_bps();
  new.platform_fee_paisa:=round(new.amount_paisa::numeric*new.platform_fee_bps/10000)::bigint;
  new.partner_net_paisa:=new.amount_paisa-new.platform_fee_paisa;
 else
  new.platform_fee_bps:=null; new.platform_fee_paisa:=null; new.partner_net_paisa:=null;
 end if;
 return new;
end $$;
update public.tbl_activity_payments set platform_fee_bps=private.platform_fee_bps(),platform_fee_paisa=round(amount_paisa::numeric*private.platform_fee_bps()/10000)::bigint,partner_net_paisa=amount_paisa-round(amount_paisa::numeric*private.platform_fee_bps()/10000)::bigint where status='paid' and last_verified_at is not null and paid_at is not null and provider_status in ('PAID','SUCCESS');
create trigger snapshot_activity_payment_fee before insert or update on public.tbl_activity_payments for each row execute function private.snapshot_activity_payment_fee();

create function private.get_partner_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); activities jsonb; summary jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.tbl_users where id=me and account_type='partner' and is_active=1 and coalesce(is_delete,0)=0) then raise exception 'Partner account required' using errcode='42501'; end if;
 with counts as (
 select e.id,e.title,e.event_start_time,e.price,e.status,e.visibility_type,
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
 select coalesce(jsonb_agg(jsonb_build_object('event_id',id,'title',title,'starts_at',event_start_time,'price_inr',price,'status',status,'visibility',visibility_type,'registration_count',registration_count,'pending_count',pending_count,'approved_count',approved_count,'rejected_count',rejected_count,'paid_registration_count',paid_registration_count,'gross_paisa',gross_paisa,'platform_fee_paisa',platform_fee_paisa,'net_paisa',net_paisa) order by event_start_time desc),'[]'),
 jsonb_build_object('hosted_activities',count(*),'total_registrations',coalesce(sum(registration_count),0),'paid_registrations',coalesce(sum(paid_registration_count),0),'pending_registrations',coalesce(sum(pending_count),0),'approved_registrations',coalesce(sum(approved_count),0),'rejected_registrations',coalesce(sum(rejected_count),0),'gross_paisa',coalesce(sum(gross_paisa),0),'platform_fee_paisa',coalesce(sum(platform_fee_paisa),0),'net_paisa',coalesce(sum(net_paisa),0),'platform_fee_bps',private.platform_fee_bps()) into activities,summary from counts;
 return jsonb_build_object('summary',summary,'activities',activities);
end $$;
create function public.get_partner_dashboard() returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_partner_dashboard() $$;
create function private.get_partner_registrations(p_event_id integer default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.tbl_users where id=me and account_type='partner' and is_active=1 and coalesce(is_delete,0)=0) then raise exception 'Partner account required' using errcode='42501'; end if;
 if p_event_id is not null and not private.partner_owns_activity(p_event_id) then raise exception 'Activity ownership required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('participant_id',r.id,'user_id',r.user_id,'event_id',e.id,'activity_title',e.title,'display_name',u.fullname,'status',r.status,'payment_status',case when paid.amount>0 then 'paid' when not e.is_paid then 'free' else coalesce(latest.status,'unpaid') end,'amount_paid_paisa',coalesce(paid.amount,0),'registered_at',r.created_at,'answers',(select coalesce(jsonb_agg(jsonb_build_object('question_id',q.id,'label',q.label,'value',a.value) order by q.display_order),'[]') from public.tbl_activity_registration_answers a join public.tbl_activity_registration_questions q on q.id=a.question_id where a.event_id=e.id and a.user_id=r.user_id)) order by r.created_at desc),'[]') into result
 from public.tbl_event_participants r join public.tbl_events e on e.id=r.event_id join public.tbl_users u on u.id=r.user_id
 left join lateral(select sum(p.amount_paisa) amount from public.tbl_activity_payments p where p.event_id=e.id and p.user_id=r.user_id and p.status='paid' and p.last_verified_at is not null and p.paid_at is not null and p.provider_status in ('PAID','SUCCESS')) paid on true
 left join lateral(select p.status from public.tbl_activity_payments p where p.event_id=e.id and p.user_id=r.user_id order by p.created_at desc limit 1) latest on true
 where e.created_by=me and (p_event_id is null or e.id=p_event_id) and r.status<>'left';
 return result;
end $$;
create function public.get_partner_registrations(p_event_id integer default null) returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_partner_registrations(p_event_id) $$;

revoke all on function private.platform_fee_bps(),private.snapshot_activity_payment_fee() from public,anon,authenticated;
revoke all on function private.save_activity_registration_questions(integer,jsonb),private.get_activity_registration_form(integer),private.assert_registration_complete(integer,integer),private.submit_activity_registration(integer,jsonb,text),private.get_partner_dashboard(),private.get_partner_registrations(integer) from public,anon;
grant execute on function private.save_activity_registration_questions(integer,jsonb),private.get_activity_registration_form(integer),private.assert_registration_complete(integer,integer),private.submit_activity_registration(integer,jsonb,text),private.get_partner_dashboard(),private.get_partner_registrations(integer) to authenticated;
revoke all on function public.save_activity_registration_questions(integer,jsonb),public.get_activity_registration_form(integer),public.submit_activity_registration(integer,jsonb,text),public.get_partner_dashboard(),public.get_partner_registrations(integer) from public,anon;
grant execute on function public.save_activity_registration_questions(integer,jsonb),public.get_activity_registration_form(integer),public.submit_activity_registration(integer,jsonb,text),public.get_partner_dashboard(),public.get_partner_registrations(integer) to authenticated;
alter publication supabase_realtime add table public.tbl_activity_registration_answers;
CREATE OR REPLACE FUNCTION public.create_activity(p_payload jsonb, p_status text DEFAULT 'published'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me integer := public.get_current_app_user_id();
  eid integer;
  cid integer;
  cat text := nullif(trim(p_payload->>'category'), '');
  cover text := nullif(trim(p_payload->>'cover_url'), '');
  raw_join_type text;
  normalized_join_type text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Activity payload must be an object' using errcode = '22023';
  end if;
  if p_status not in ('draft', 'published') then
    raise exception 'Invalid activity status' using errcode = '22023';
  end if;
  if nullif(trim(p_payload->>'title'), '') is null then
    raise exception 'Title is required' using errcode = '22023';
  end if;

  raw_join_type := lower(
    nullif(trim(coalesce(p_payload->>'join_type', p_payload->>'join_method')), '')
  );
  normalized_join_type := case raw_join_type
    when 'direct' then 'direct'
    when 'approval' then 'approval'
    when 'approval_required' then 'approval'
    when 'host_approval' then 'approval'
    when 'host_approval_required' then 'approval'
    else null
  end;
  if normalized_join_type is null then
    raise exception 'join_type is required and must be direct or approval'
      using errcode = '22023';
  end if;

  insert into public.tbl_events(
    created_by, updated_by, title, description, event_start_time,
    event_end_time, registration_close_time, max_participants,
    visibility_type, join_type, location, display_location, latitude,
    longitude, is_paid, price, currency, intent, status, media
  )
  values(
    me, me, trim(p_payload->>'title'),
    nullif(trim(p_payload->>'description'), ''),
    nullif(p_payload->>'event_start_time', '')::timestamptz,
    nullif(p_payload->>'event_end_time', '')::timestamptz,
    nullif(p_payload->>'registration_close_time', '')::timestamptz,
    coalesce((p_payload->>'max_participants')::integer, 25),
    coalesce(nullif(p_payload->>'visibility_type', ''), 'public'),
    normalized_join_type,
    nullif(p_payload->>'location', ''),
    nullif(p_payload->>'display_location', ''),
    nullif(p_payload->>'latitude', '')::numeric,
    nullif(p_payload->>'longitude', '')::numeric,
    coalesce((p_payload->>'is_paid')::boolean, false),
    coalesce((p_payload->>'price_inr')::numeric, 0),
    'INR',
    coalesce(nullif(p_payload->>'activity_type', ''), nullif(p_payload->>'intent', '')),
    p_status,
    case when cover is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('url', cover, 'type', 'image'))
    end
  )
  returning id into eid;

  if cat is not null then
    select id into cid
    from public.tbl_categories
    where lower(name) = lower(cat)
    order by id
    limit 1;
    if cid is null then
      insert into public.tbl_categories(name) values(cat) returning id into cid;
    end if;
    insert into public.tbl_event_categories(event_id, category_id, created_by, updated_by)
    values(eid, cid, me, me)
    on conflict do nothing;
  end if;

  if nullif(p_payload->>'community_id', '') is not null then
    update public.tbl_chat_rooms
    set event_id = eid, updated_at = now()
    where id = (p_payload->>'community_id')::integer
      and room_type = 'community'
      and created_by = me;
  end if;
  if p_payload ? 'registration_questions' then perform private.save_activity_registration_questions(eid,p_payload->'registration_questions'); end if;
 return eid;
end
$function$;

CREATE OR REPLACE FUNCTION public.update_activity(p_event_id integer, p_patch jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me integer:=public.get_current_app_user_id(); cat text:=nullif(trim(p_patch->>'category'),''); cid integer; cover text:=nullif(trim(p_patch->>'cover_url'),'');
begin
 if not exists(select 1 from public.tbl_events where id=p_event_id and created_by=me) then raise exception 'Activity not found or not owned' using errcode='42501'; end if;
 update public.tbl_events set title=case when p_patch?'title' then trim(p_patch->>'title') else title end,description=case when p_patch?'description' then nullif(trim(p_patch->>'description'),'') else description end,event_start_time=case when p_patch?'event_start_time' then nullif(p_patch->>'event_start_time','')::timestamptz else event_start_time end,event_end_time=case when p_patch?'event_end_time' then nullif(p_patch->>'event_end_time','')::timestamptz else event_end_time end,registration_close_time=case when p_patch?'registration_close_time' then nullif(p_patch->>'registration_close_time','')::timestamptz else registration_close_time end,max_participants=case when p_patch?'max_participants' then (p_patch->>'max_participants')::integer else max_participants end,visibility_type=case when p_patch?'visibility_type' then p_patch->>'visibility_type' else visibility_type end,join_type=case when p_patch?'join_type' then p_patch->>'join_type' else join_type end,location=case when p_patch?'location' then nullif(p_patch->>'location','') else location end,display_location=case when p_patch?'display_location' then nullif(p_patch->>'display_location','') else display_location end,latitude=case when p_patch?'latitude' then nullif(p_patch->>'latitude','')::numeric else latitude end,longitude=case when p_patch?'longitude' then nullif(p_patch->>'longitude','')::numeric else longitude end,is_paid=case when p_patch?'is_paid' then (p_patch->>'is_paid')::boolean else is_paid end,price=case when p_patch?'price_inr' then (p_patch->>'price_inr')::numeric else price end,intent=case when p_patch?'activity_type' then p_patch->>'activity_type' else intent end,status=case when p_patch?'status' then p_patch->>'status' else status end,is_cancelled=case when p_patch->>'status'='cancelled' then true else is_cancelled end,media=case when p_patch?'cover_url' then case when cover is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('url',cover,'type','image')) end else media end,updated_by=me,updated_at=now() where id=p_event_id;
 if cat is not null then select id into cid from public.tbl_categories where lower(name)=lower(cat) order by id limit 1; if cid is null then insert into public.tbl_categories(name) values(cat) returning id into cid; end if; delete from public.tbl_event_categories where event_id=p_event_id; insert into public.tbl_event_categories(event_id,category_id,created_by,updated_by) values(p_event_id,cid,me,me); end if;
 if p_patch ? 'registration_questions' then perform private.save_activity_registration_questions(p_event_id,p_patch->'registration_questions'); end if;
 return p_event_id;
end $function$;

CREATE OR REPLACE FUNCTION public.request_join_activity(p_event_id integer, p_status text DEFAULT 'going'::text)
 RETURNS tbl_event_participants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me integer := public.get_current_app_user_id();
  event_row public.tbl_events;
  db_status text;
  result_row public.tbl_event_participants;
  occupied integer;
begin
  select *
    into event_row
    from public.tbl_events
    where id = p_event_id
      and not coalesce(is_deleted, false)
      and not coalesce(is_cancelled, false)
    for update;

  if event_row.id is null then
    raise exception 'Activity is unavailable';
  end if;
  if p_status not in ('left','declined') then
    perform private.assert_registration_complete(p_event_id, me);
  end if;
  if event_row.created_by = me then
    raise exception 'Hosts cannot join their own activity';
  end if;
  if event_row.registration_close_time is not null
     and event_row.registration_close_time < now()
     and p_status not in ('left', 'declined') then
    raise exception 'Registration is closed';
  end if;
  if p_status not in ('going', 'interested', 'waitlist', 'left', 'declined') then
    raise exception 'Invalid participation status';
  end if;

  select count(*)
    into occupied
    from public.tbl_event_participants
    where event_id = p_event_id
      and user_id <> me
      and status in ('approved', 'going', 'payment_required');

  db_status := case
    when p_status in ('left', 'declined') then 'left'
    when p_status in ('interested', 'waitlist') then 'pending'
    when coalesce(event_row.is_paid, false)
         and event_row.join_type = 'direct'
         and (event_row.max_participants is null or occupied < event_row.max_participants)
      then 'payment_required'
    when event_row.join_type = 'direct'
         and (event_row.max_participants is null or occupied < event_row.max_participants)
      then 'approved'
    else 'pending'
  end;

  insert into public.tbl_event_participants(
    event_id, user_id, status, responded_at, joined_at
  )
  values (
    p_event_id,
    me,
    db_status,
    case when db_status in ('approved', 'rejected') then now() end,
    case when db_status = 'approved' then now() end
  )
  on conflict(event_id, user_id) do update
    set status = excluded.status,
        responded_at = excluded.responded_at,
        joined_at = excluded.joined_at
  returning * into result_row;

  return result_row;
end
$function$;

CREATE OR REPLACE FUNCTION public.prepare_activity_payment(p_event_id integer)
 RETURNS tbl_activity_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me integer := public.get_current_app_user_id();
  event_row public.tbl_events;
  participation public.tbl_event_participants;
  payment public.tbl_activity_payments;
  amount_minor bigint;
  occupied integer;
  generated_order_id text;
begin
  if me is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
    into event_row
    from public.tbl_events
    where id = p_event_id
      and status = 'published'
      and not coalesce(is_deleted, false)
      and not coalesce(is_cancelled, false)
    for update;

  if event_row.id is null then
    raise exception 'Activity is unavailable';
  end if;
  perform private.assert_registration_complete(p_event_id, me);
  if event_row.created_by = me then
    raise exception 'Hosts cannot pay to join their own activity';
  end if;
  if event_row.registration_close_time is not null
     and event_row.registration_close_time < now() then
    raise exception 'Registration is closed';
  end if;
  if not coalesce(event_row.is_paid, false)
     or coalesce(event_row.price, 0) <= 0 then
    raise exception 'This activity does not require payment';
  end if;
  if coalesce(event_row.currency, 'INR') <> 'INR' then
    raise exception 'Only INR activities are supported';
  end if;

  amount_minor := round(event_row.price * 100)::bigint;
  if amount_minor <= 0 or abs(event_row.price * 100 - amount_minor) > 0.000001 then
    raise exception 'Activity price must have at most two decimal places';
  end if;

  select *
    into participation
    from public.tbl_event_participants
    where event_id = p_event_id and user_id = me
    for update;

  if participation.status in ('approved', 'going') then
    raise exception 'You have already joined this activity';
  end if;
  if event_row.join_type = 'approval'
     and coalesce(participation.status, '') <> 'payment_required' then
    raise exception 'Host approval is required before payment';
  end if;

  update public.tbl_activity_payments
    set status = 'expired',
        provider_status = coalesce(provider_status, 'LOCAL_EXPIRED'),
        updated_at = now()
    where event_id = p_event_id
      and user_id = me
      and status in ('created', 'pending')
      and checkout_expires_at <= now();

  select *
    into payment
    from public.tbl_activity_payments
    where event_id = p_event_id
      and user_id = me
      and status in ('created', 'pending')
      and checkout_expires_at > now()
    order by created_at desc
    limit 1
    for update;

  if payment.id is not null then
    if payment.amount_paisa <> amount_minor or payment.currency <> 'INR' then
      raise exception 'The activity price changed; start a new payment attempt';
    end if;
    return payment;
  end if;

  select count(*)
    into occupied
    from public.tbl_event_participants
    where event_id = p_event_id
      and user_id <> me
      and status in ('approved', 'going', 'payment_required');

  if event_row.max_participants is not null
     and occupied >= event_row.max_participants then
    raise exception 'Activity is full';
  end if;

  if event_row.join_type <> 'approval' then
    insert into public.tbl_event_participants(
      event_id, user_id, status, responded_at, joined_at
    )
    values (p_event_id, me, 'payment_required', null, null)
    on conflict(event_id, user_id) do update
      set status = case
        when tbl_event_participants.status in ('approved', 'going')
          then tbl_event_participants.status
        else 'payment_required'
      end,
      responded_at = null,
      joined_at = null
    returning * into participation;
  end if;

  generated_order_id :=
    'wn_' || p_event_id::text || '_' || me::text || '_' ||
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);

  insert into public.tbl_activity_payments(
    event_id,
    user_id,
    provider_order_id,
    amount_paisa,
    currency,
    status,
    checkout_expires_at
  )
  values (
    p_event_id,
    me,
    generated_order_id,
    amount_minor,
    'INR',
    'created',
    now() + interval '20 minutes'
  )
  returning * into payment;

  return payment;
end
$function$;

notify pgrst, 'reload schema';