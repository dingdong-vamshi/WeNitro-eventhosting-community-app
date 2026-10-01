-- Baseline text moderation is enforced at persistence, including direct API writes.
-- This is an explicit-word filter, NOT an image classifier or a guarantee of semantic moderation.
create function private.guard_ugc_text() returns trigger language plpgsql set search_path='' as $$
declare field text; value text; previous text;
begin
  foreach field in array tg_argv loop
    value:=coalesce(to_jsonb(new)->>field,'');
    if tg_op='UPDATE' then
      previous:=coalesce(to_jsonb(old)->>field,'');
      if value=previous then continue; end if;
    end if;
    -- Whole-word boundaries avoid matching innocent substrings such as Scunthorpe.
    if lower(normalize(value,NFKC)) ~ '\m(fuck|fucker|fuckers|fucking|motherfucker|motherfuckers|shit|asshole|assholes|bitch|bitches|cunt|porn|porno|pornography|nigger|niggers|faggot|faggots)\M' then
      raise exception 'Please remove explicit or hateful language before saving.' using errcode='22023';
    end if;
  end loop;
  return new;
end $$;
revoke all on function private.guard_ugc_text() from public,anon,authenticated;
create trigger guard_ugc_text before insert or update on public.tbl_events for each row execute function private.guard_ugc_text('title','description','location_instruction','display_location');
create trigger guard_ugc_text before insert or update on public.tbl_users for each row execute function private.guard_ugc_text('fullname','username','bio','about','occupation');
create trigger guard_ugc_text before insert or update on public.tbl_chat_rooms for each row execute function private.guard_ugc_text('title','description','tagline');
create trigger guard_ugc_text before insert or update on public.tbl_community_posts for each row execute function private.guard_ugc_text('title','body','category');
create trigger guard_ugc_text before insert or update on public.tbl_community_post_comments for each row execute function private.guard_ugc_text('body');
create trigger guard_ugc_text before insert or update on public.tbl_event_comments for each row execute function private.guard_ugc_text('body');
create trigger guard_ugc_text before insert or update on public.tbl_messages for each row execute function private.guard_ugc_text('content');
create trigger guard_ugc_text before insert or update on public.tbl_activity_vibes for each row execute function private.guard_ugc_text('caption','hashtags');
create trigger guard_ugc_text before insert or update on public.tbl_vibe_comments for each row execute function private.guard_ugc_text('text');
create trigger guard_ugc_text before insert or update on public.tbl_stories for each row execute function private.guard_ugc_text('caption');
create trigger guard_ugc_text before insert or update on public.tbl_chat_polls for each row execute function private.guard_ugc_text('question');
create trigger guard_ugc_text before insert or update on public.tbl_chat_poll_options for each row execute function private.guard_ugc_text('option_text');
create trigger guard_ugc_text before insert or update on public.tbl_participant_ratings for each row execute function private.guard_ugc_text('comment');
