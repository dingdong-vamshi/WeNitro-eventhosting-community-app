create index if not exists idx_notifications_actor_id
  on public.notifications(actor_id) where actor_id is not null;
create index if not exists idx_verification_requests_reviewer_id
  on public.verification_requests(reviewer_id) where reviewer_id is not null;

drop policy if exists "verification edit own draft" on public.verification_requests;
drop policy if exists "verification review admin" on public.verification_requests;
create policy "verification update owner draft or admin"
on public.verification_requests
for update to authenticated
using (
  (user_id = (select auth.uid()) and status = 'draft')
  or (select private.is_app_admin())
)
with check (
  (
    user_id = (select auth.uid())
    and status in ('draft', 'submitted')
    and reviewer_id is null
  )
  or (select private.is_app_admin())
);
