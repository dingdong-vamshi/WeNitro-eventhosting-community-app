-- Read deployed trigger wiring, then exercise the deployed guard on a temporary
-- row only. No application rows/identities/payment fixtures are changed.
-- This verifies function semantics + exact attachments, not a hosted UI save.
begin;
do $$
declare expected record; actual text;
begin
 for expected in select * from (values
  ('tbl_activity_registration_questions','label|options'),
  ('tbl_activity_entry_categories','name'),
  ('tbl_activity_registration_answers','value'),
  ('tbl_event_feedback','comment'),
  ('tbl_partner_profiles','business_name|description'),
  ('tbl_chat_rooms','title|description|tagline|tags|rules')
 ) v(table_name,args) loop
  select trim(trailing '|' from replace(encode(t.tgargs,'escape'),'\000','|')) into actual
  from pg_trigger t where t.tgrelid=('public.'||expected.table_name)::regclass
   and t.tgname='guard_ugc_text' and not t.tgisinternal and t.tgenabled='O'
   and t.tgfoid='private.guard_ugc_text()'::regprocedure;
  if actual is distinct from expected.args then raise exception 'Guard wiring mismatch: %',expected.table_name; end if;
 end loop;
end $$;
create temporary table qa_registration_text_guard(
 label text, options jsonb, name text, value jsonb, comment text,
 business_name text, description text, title text, tagline text, tags text[], rules text[], revision int default 0
) on commit drop;
insert into qa_registration_text_guard(label,options,name,value,comment,business_name,description,title,tagline,tags,rules)
values('shit','["Clean","fuck"]','shit','"shit"','shit','shit','shit','shit','shit',array['shit'],array['shit']);
create trigger guard_ugc_text before insert or update on qa_registration_text_guard for each row
execute function private.guard_ugc_text('label','options','name','value','comment','business_name','description','title','tagline','tags','rules');
-- Unchanged legacy fields do not block an unrelated edit.
update qa_registration_text_guard set revision=1;
do $$
declare field text; statement text; rejected boolean; checks int:=0;
begin
 foreach field in array array['label','name','comment','business_name','description','title','tagline'] loop
  rejected:=false;
  begin execute format('update qa_registration_text_guard set %I=%L',field,'fuck PRIVATE_SENTINEL');
  exception when sqlstate '22023' then
   if sqlerrm<>'Please remove explicit or hateful language before saving.' then raise exception 'Unexpected moderation message'; end if;
   rejected:=true;
  end;
  if not rejected then raise exception 'Expected guard rejection: %',field; end if;
  checks:=checks+1;
 end loop;
 foreach statement in array array[
  'update qa_registration_text_guard set options=''["Clean","fucking"]''',
  'update qa_registration_text_guard set value=''"fucking"''',
  'update qa_registration_text_guard set rules=array[''Clean'',''fucking'']',
  'update qa_registration_text_guard set tags=array[''fucking'',''Clean'']'
 ] loop
  rejected:=false;
  begin execute statement;exception when sqlstate '22023' then rejected:=true;end;
  if not rejected then raise exception 'Expected JSON/array guard rejection'; end if;
  checks:=checks+1;
 end loop;
 if checks<>11 then raise exception 'Incomplete checks'; end if;
end $$;
update qa_registration_text_guard set label='Clean question',options='["Standard","Premium"]',name='General admission',value='"Scunthorpe"',comment='Great class',business_name='Local Sports',description='Fitness classes',title='Clean Community',tagline='Meet friends',tags=array['sport'],rules=array['Be kind'];
select 'PASS: six deployed trigger bindings, 11 denied field mutations, generic error, unchanged legacy and clean replacement; temporary rows only' as proof;
rollback;
