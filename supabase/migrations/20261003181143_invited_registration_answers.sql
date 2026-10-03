-- Host invitations authorize participation, not omission of required answers.
create or replace function private.submit_activity_registration(p_event_id integer,p_answers jsonb,p_status text default 'going') returns public.tbl_event_participants
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
 if state in ('approved','going','paid','payment_required') and not exists(
  select 1 from public.tbl_activity_registration_questions required_question
  where required_question.event_id=p_event_id and required_question.required and not exists(
   select 1 from public.tbl_activity_registration_answers saved_answer
   where saved_answer.question_id=required_question.id and saved_answer.event_id=p_event_id and saved_answer.user_id=me
  )
 ) then
  -- Idempotent retry preserves the already locked answers; never rewrites them.
  select * into result from public.tbl_event_participants where event_id=p_event_id and user_id=me; return result;
 end if;
 -- Initial answers are still required after a Host invitation. Preserve its
 -- authorization, but never allow new answers after registration closes.
 perform private.assert_activity_mutable(p_event_id);
 if exists(select 1 from public.tbl_events where id=p_event_id and registration_close_time is not null and registration_close_time<=now()) then
  raise exception 'Registration is closed' using errcode='42501';
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
 if state in ('approved','going','paid','payment_required') then
  select * into result from public.tbl_event_participants where event_id=p_event_id and user_id=me;
 else
  result:=public.request_join_activity(p_event_id,p_status);
 end if;
 return result;
end $$;
