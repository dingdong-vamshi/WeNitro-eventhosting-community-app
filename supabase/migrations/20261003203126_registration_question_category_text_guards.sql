-- A18: hosting registration text and Partner ticket names use the same persisted
-- explicit-word policy as the other user-authored fields. JSON option arrays are
-- inspected by the existing guard; unchanged legacy text remains editable for
-- unrelated settings. This does not implement semantic or image moderation.
create trigger guard_ugc_text
before insert or update on public.tbl_activity_registration_questions
for each row execute function private.guard_ugc_text('label', 'options');

create trigger guard_ugc_text
before insert or update on public.tbl_activity_entry_categories
for each row execute function private.guard_ugc_text('name');

create trigger guard_ugc_text
before insert or update on public.tbl_activity_registration_answers
for each row execute function private.guard_ugc_text('value');

create trigger guard_ugc_text
before insert or update on public.tbl_event_feedback
for each row execute function private.guard_ugc_text('comment');

create trigger guard_ugc_text
before insert or update on public.tbl_partner_profiles
for each row execute function private.guard_ugc_text('business_name', 'description');

-- Preserve the original Community/group text coverage and add editable rules.
drop trigger guard_ugc_text on public.tbl_chat_rooms;
create trigger guard_ugc_text
before insert or update on public.tbl_chat_rooms
for each row execute function private.guard_ugc_text('title', 'description', 'tagline', 'tags', 'rules');
