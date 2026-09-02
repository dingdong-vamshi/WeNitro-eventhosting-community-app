create policy "chat members can receive realtime messages"
on realtime.messages
for select
to authenticated
using (
  case
    when realtime.topic() ~ '^room:[1-9][0-9]*$'
      then public.is_chat_member(split_part(realtime.topic(), ':', 2)::integer)
    else false
  end
);

create policy "chat members can send realtime messages"
on realtime.messages
for insert
to authenticated
with check (
  case
    when realtime.topic() ~ '^room:[1-9][0-9]*$'
      then public.is_chat_member(split_part(realtime.topic(), ':', 2)::integer)
    else false
  end
);
