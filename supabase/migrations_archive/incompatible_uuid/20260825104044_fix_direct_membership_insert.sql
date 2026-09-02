create or replace function public.create_direct_conversation(other_user_id uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  pair_key text;
  new_conversation_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if other_user_id is null or other_user_id = current_user_id then raise exception 'Choose another WeNitro member'; end if;
  if not exists (select 1 from public.profiles where id = other_user_id and deleted_at is null) then raise exception 'Member is unavailable'; end if;
  pair_key := least(current_user_id::text, other_user_id::text) || ':' || greatest(current_user_id::text, other_user_id::text);
  select id into new_conversation_id from public.chat_conversations where kind = 'direct' and direct_pair_key = pair_key limit 1;
  if new_conversation_id is not null then return new_conversation_id; end if;
  insert into public.chat_conversations(created_by, kind, direct_pair_key)
  values (current_user_id, 'direct', pair_key)
  on conflict (direct_pair_key) where kind = 'direct' and direct_pair_key is not null
  do update set updated_at = public.chat_conversations.updated_at
  returning id into new_conversation_id;
  insert into public.chat_members(conversation_id, user_id, role) values (new_conversation_id, current_user_id, 'admin');
  insert into public.chat_members(conversation_id, user_id, role) values (new_conversation_id, other_user_id, 'member');
  return new_conversation_id;
end;
$$;
revoke all on function public.create_direct_conversation(uuid) from public, anon;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
