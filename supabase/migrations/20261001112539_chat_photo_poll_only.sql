-- Preserve old video history, but reject new direct video attachments in every chat.
-- Shared Vibe/Post cards remain links to their original content, not attachments.
create function private.guard_chat_attachment_type() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and new.message_type is not distinct from old.message_type
     and new.media_url is not distinct from old.media_url then return new; end if;
  if new.message_type='video' or (new.media_url is not null
    and lower(split_part(new.media_url,'?',1)) ~ '\.(mp4|mov|webm|m4v|avi|mkv)$') then
    raise exception 'Chat supports Photo and Poll only. Share videos in Vibes or Community Posts.' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function private.guard_chat_attachment_type() from public,anon,authenticated;
create trigger guard_chat_attachment_type before insert or update of message_type,media_url
on public.tbl_messages for each row execute function private.guard_chat_attachment_type();
