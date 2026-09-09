create unique index if not exists tbl_event_feedback_event_author_unique
  on public.tbl_event_feedback (event_id, created_by);

grant select, insert on public.tbl_event_feedback to authenticated;
grant usage, select on sequence public.tbl_event_reactions_id_seq to authenticated;

drop policy if exists activity_feedback_visible_event on public.tbl_event_feedback;
create policy activity_feedback_visible_event
on public.tbl_event_feedback
for select
to authenticated
using (
  exists (
    select 1
    from public.tbl_events event
    where event.id = tbl_event_feedback.event_id
      and event.status <> 'draft'
      and not coalesce(event.is_deleted, false)
  )
);

drop policy if exists activity_feedback_participant_insert on public.tbl_event_feedback;
create policy activity_feedback_participant_insert
on public.tbl_event_feedback
for insert
to authenticated
with check (
  created_by = public.get_current_app_user_id()
  and reaction in ('great', 'good', 'poor')
  and exists (
    select 1
    from public.tbl_events event
    join public.tbl_event_participants participant
      on participant.event_id = event.id
     and participant.user_id = public.get_current_app_user_id()
     and participant.status in ('approved', 'going', 'paid')
    where event.id = tbl_event_feedback.event_id
      and event.event_end_time is not null
      and event.event_end_time <= now()
      and not coalesce(event.is_deleted, false)
      and not coalesce(event.is_cancelled, false)
  )
);
