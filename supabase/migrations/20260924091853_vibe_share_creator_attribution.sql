-- Add server-authoritative creator attribution to new Vibe shares. The existing
-- shared_by field still identifies the sender, not the original creator.
-- Existing message history and all share authorization remain unchanged.
do $$
declare
  definition text;
  source_hash text;
  anchor text := '  for i in 1..room_count loop';
  addition text := $attribution$  if p_share_kind='vibe' then
    select payload || jsonb_strip_nulls(jsonb_build_object(
      'creator_id',v.user_id::text,
      'creator_name',coalesce(nullif(btrim(u.fullname),''),nullif(btrim(u.username),''))
    )) into payload
    from public.tbl_activity_vibes v
    left join public.tbl_users u on u.id=v.user_id
    where v.id=p_entity_id;
  end if;
$attribution$;
begin
  select pg_get_functiondef(oid),md5(prosrc) into definition,source_hash
  from pg_proc where oid='public.send_chat_share(integer[],uuid[],text,bigint)'::regprocedure;
  -- Hash captured from the read-only production preflight on 24 September.
  -- Fail closed instead of overwriting a newer implementation unexpectedly.
  if source_hash <> '566925d2e6aa9c00f0714ff7a1ebd964'
     or strpos(definition,anchor)=0 then
    raise exception 'Unexpected send_chat_share definition; review creator attribution migration';
  end if;
  execute replace(definition,anchor,addition || anchor);
end $$;
