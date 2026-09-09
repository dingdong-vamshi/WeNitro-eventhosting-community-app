drop policy if exists "conversations read member" on public.chat_conversations;
create policy "conversations read member"
on public.chat_conversations
for select
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.is_chat_member(id))
);
