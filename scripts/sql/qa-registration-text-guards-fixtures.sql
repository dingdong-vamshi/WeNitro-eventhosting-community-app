-- No DDL. Execute only after the coordinator deploys the text-guard migration.
-- Each attempted write is expected to raise 22023 inside a subtransaction;
-- outer ROLLBACK additionally discards every possible write. Restricted to
-- existing CHAT001 controlled fixtures. Missing rows are UNAVAILABLE, not PASS.
begin;
select c.relname as table_name, t.tgenabled,
 trim(trailing '|' from replace(encode(t.tgargs,'escape'),'\000','|')) as guarded_fields,
 t.tgfoid='private.guard_ugc_text()'::regprocedure as uses_existing_private_guard
from pg_trigger t join pg_class c on c.oid=t.tgrelid
where t.tgname='guard_ugc_text' and not t.tgisinternal and t.tgrelid in (
 'public.tbl_activity_registration_questions'::regclass,
 'public.tbl_activity_entry_categories'::regclass,
 'public.tbl_activity_registration_answers'::regclass,
 'public.tbl_event_feedback'::regclass,
 'public.tbl_partner_profiles'::regclass,
 'public.tbl_chat_rooms'::regclass
) order by c.relname;
do $$
declare test record; available boolean; rejected boolean; outcome text; results jsonb:='[]';
begin
 for test in select * from (values
  ('tbl_activity_registration_questions','label',quote_literal('fuck PRIVATE_SENTINEL'),'event_id=297'),
  ('tbl_activity_registration_questions','options',quote_literal('["Clean","fuck"]')||'::jsonb','event_id=297'),
  ('tbl_activity_entry_categories','name',quote_literal('fuck PRIVATE_SENTINEL'),'event_id=297'),
  ('tbl_activity_registration_answers','value',quote_literal('"fuck PRIVATE_SENTINEL"')||'::jsonb','event_id=297 and user_id=116'),
  ('tbl_event_feedback','comment',quote_literal('fuck PRIVATE_SENTINEL'),'event_id=300 and created_by=120'),
  ('tbl_partner_profiles','business_name',quote_literal('fuck PRIVATE_SENTINEL'),'user_id=70'),
  ('tbl_partner_profiles','description',quote_literal('fuck PRIVATE_SENTINEL'),'user_id=70'),
  ('tbl_chat_rooms','title',quote_literal('fuck PRIVATE_SENTINEL'),'id=252'),
  ('tbl_chat_rooms','description',quote_literal('fuck PRIVATE_SENTINEL'),'id=252'),
  ('tbl_chat_rooms','tagline',quote_literal('fuck PRIVATE_SENTINEL'),'id=252'),
  ('tbl_chat_rooms','tags','array[''Clean'',''fuck'']','id=252'),
  ('tbl_chat_rooms','rules','array[''Clean'',''fuck'']','id=252')
 ) v(table_name,field_name,expression,predicate) loop
  execute format('select exists(select 1 from public.%I where %s)',test.table_name,test.predicate) into available;
  if not available then outcome:='UNAVAILABLE: controlled fixture has no matching row';
  else
   rejected:=false;
   begin
    execute format('update public.%I set %I=%s where %s',test.table_name,test.field_name,test.expression,test.predicate);
    -- Always abort accepted writes, so a missing guard does not persist content.
    raise exception 'Guard accepted fixture text' using errcode='P1001';
   exception
    when sqlstate '22023' then
     if sqlerrm<>'Please remove explicit or hateful language before saving.' then raise exception 'Unexpected moderation message'; end if;
     rejected:=true;
    when sqlstate 'P1001' then rejected:=false;
   end;
   outcome:=case when rejected then 'PASS: generic 22023; statement rolled back' else 'FAIL: guard accepted text; statement rolled back' end;
  end if;
  results:=results||jsonb_build_array(jsonb_build_object('table',test.table_name,'field',test.field_name,'outcome',outcome));
 end loop;
 perform set_config('qa.text_guard_results',results::text,true);
end $$;
select current_setting('qa.text_guard_results')::jsonb as scoped_fixture_results;
rollback;
