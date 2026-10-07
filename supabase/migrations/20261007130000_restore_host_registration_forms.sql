-- Restore registration questions for every Activity host while keeping answers private.
-- Hosts and active co-hosts manage the form through scoped security-definer RPCs;
-- participants retain direct read access only to their own answers.

create or replace function private.save_activity_registration_questions(p_event_id integer,p_questions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q jsonb; idx integer:=0; qid bigint; seen bigint[]:='{}'; locked boolean; existing jsonb; me integer:=public.get_current_app_user_id();
begin
 if auth.uid() is null or not private.can_manage_activity(p_event_id,me) then raise exception 'Activity management required' using errcode='42501'; end if;
 perform private.assert_activity_mutable(p_event_id);
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

create or replace function public.save_activity_registration_questions(p_event_id integer,p_questions jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.save_activity_registration_questions(p_event_id,p_questions) $$;

create or replace function private.get_activity_registration_responses(p_event_id integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); result jsonb;
begin
 if auth.uid() is null or not private.can_manage_activity(p_event_id,me) then raise exception 'Activity management required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'participant_id',p.id,
   'user_id',p.user_id,
   'display_name',u.fullname,
   'username',u.username,
   'status',p.status,
   'role',coalesce(p.role,'participant'),
   'answers',(select coalesce(jsonb_agg(jsonb_build_object(
     'question_id',q.id,
     'label',q.label,
     'type',q.type,
     'value',a.value
   ) order by q.display_order),'[]')
   from public.tbl_activity_registration_answers a
   join public.tbl_activity_registration_questions q on q.id=a.question_id and q.event_id=a.event_id
   where a.event_id=p_event_id and a.user_id=p.user_id)
 ) order by p.created_at),'[]') into result
 from public.tbl_event_participants p
 join public.tbl_users u on u.id=p.user_id
 where p.event_id=p_event_id and p.status<>'left';
 return result;
end $$;

create or replace function public.get_activity_registration_responses(p_event_id integer) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.get_activity_registration_responses(p_event_id) $$;

revoke all on function private.save_activity_registration_questions(integer,jsonb),public.save_activity_registration_questions(integer,jsonb),private.get_activity_registration_responses(integer),public.get_activity_registration_responses(integer) from public,anon;
grant execute on function private.save_activity_registration_questions(integer,jsonb),public.save_activity_registration_questions(integer,jsonb),private.get_activity_registration_responses(integer),public.get_activity_registration_responses(integer) to authenticated;

notify pgrst,'reload schema';
