-- Read liker identities only within the existing Activity visibility boundary.
-- Existing owner-only INSERT/UPDATE/DELETE policies are unchanged.
create policy visible_activity_likes on public.tbl_event_likes
for select to authenticated
using (public.can_read_event(event_id));
