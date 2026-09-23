-- Cover the composite registration-question foreign key used by cascade checks.
create index if not exists registration_answers_event_question_idx
  on public.tbl_activity_registration_answers (event_id, question_id);
