-- Activity media can stay in its Activity without appearing in the Vibes feed.
-- Feed placement is independent of audience: linked media remains participants-only.
alter table public.tbl_activity_vibes add column show_in_vibes boolean not null default true;

create function private.enforce_activity_media_audience() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.event_id is not null and new.visibility='public' then new.visibility:='activity';end if;
 if new.event_id is null then new.show_in_vibes:=true;end if;
 return new;
end $$;
revoke all on function private.enforce_activity_media_audience() from public,anon,authenticated;
create trigger enforce_activity_media_audience before insert or update of event_id,visibility,show_in_vibes
 on public.tbl_activity_vibes for each row execute function private.enforce_activity_media_audience();
-- Existing associated media follows the same participant audience contract.
update public.tbl_activity_vibes set visibility='activity' where event_id is not null and visibility='public';

create function public.vibe_create(p_event_id bigint,p_media_path text,p_media_type text,p_caption text,p_hashtags text[],p_visibility text,p_show_in_vibes boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); result public.tbl_activity_vibes;
 media_kind text:=case when p_media_type='image' then 'photo' else p_media_type end;
begin
 if auth.uid() is null or me is null then raise exception 'Authentication required' using errcode='42501';end if;
 if media_kind is null or media_kind not in ('photo','video') or nullif(p_media_path,'') is null then raise exception 'Invalid vibe media';end if;
 if p_visibility is null or p_visibility not in ('public','activity','private') then raise exception 'Invalid vibe visibility';end if;
 if p_show_in_vibes is null then raise exception 'Choose whether to show this media in Vibes';end if;
 insert into public.tbl_activity_vibes(event_id,user_id,media_url,media_type,caption,hashtags,visibility,show_in_vibes)
 values(p_event_id,me,p_media_path,media_kind,left(coalesce(p_caption,''),2200),coalesce(p_hashtags,'{}'),p_visibility,p_show_in_vibes)
 returning * into result;
 return to_jsonb(result);
end $$;
-- Exact old signature remains callable; no overlapping default-argument overload.
create or replace function public.vibe_create(p_event_id bigint,p_media_path text,p_media_type text,p_caption text,p_hashtags text[],p_visibility text)
returns jsonb language sql security invoker set search_path='' as $$
 select public.vibe_create(p_event_id,p_media_path,p_media_type,p_caption,p_hashtags,p_visibility,true)
$$;
revoke all on function public.vibe_create(bigint,text,text,text,text[],text,boolean),public.vibe_create(bigint,text,text,text,text[],text) from public,anon;
grant execute on function public.vibe_create(bigint,text,text,text,text[],text,boolean),public.vibe_create(bigint,text,text,text,text[],text) to authenticated;
