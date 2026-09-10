-- Participants can revise their own response; the existing event/author unique index
-- continues to enforce one effective feedback record per participant.
grant update (reaction, comment) on public.tbl_event_feedback to authenticated;
drop policy if exists activity_feedback_participant_update on public.tbl_event_feedback;
create policy activity_feedback_participant_update
on public.tbl_event_feedback for update to authenticated
using (
  created_by = public.get_current_app_user_id()
  and exists (
    select 1 from public.tbl_events event
    join public.tbl_event_participants participant
      on participant.event_id = event.id
      and participant.user_id = public.get_current_app_user_id()
      and participant.status in ('approved', 'going', 'paid')
    where event.id = tbl_event_feedback.event_id
      and event.event_end_time is not null and event.event_end_time <= now()
      and not coalesce(event.is_deleted, false)
      and not coalesce(event.is_cancelled, false)
  )
)
with check (
  created_by = public.get_current_app_user_id()
  and reaction in ('great', 'good', 'poor')
);
