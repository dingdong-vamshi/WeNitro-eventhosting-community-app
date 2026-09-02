alter function public.set_updated_at() set search_path = public;

revoke all on function public.is_chat_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_chat_admin(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

alter function public.create_chat_group(text, uuid[]) security invoker;
alter function public.create_community_with_owner(text, text, text, text, text[], text[], text, text, boolean) security invoker;
