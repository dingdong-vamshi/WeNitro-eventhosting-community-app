-- Event highlights require an actual host or approved/going participant.
-- Past completed events remain eligible; no changes to historical Vibes or null-event posts.
create or replace function private.viewer_can_post_activity_vibe(p_event_id integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.tbl_events e
    where e.id = p_event_id and not coalesce(e.is_deleted, false)
      and not coalesce(e.is_cancelled, false) and e.status in ('published', 'completed')
      and (e.created_by = public.get_current_app_user_id() or exists (
        select 1 from public.tbl_event_participants p
        where p.event_id = e.id and p.user_id = public.get_current_app_user_id()
          and p.status in ('approved', 'going')
      ))
  );
$$;
revoke all on function private.viewer_can_post_activity_vibe(integer) from public, anon;
grant execute on function private.viewer_can_post_activity_vibe(integer) to authenticated;

create or replace function public.list_eligible_vibe_activities(p_after_id integer default null, p_limit integer default 51)
returns setof public.tbl_events language sql stable security invoker set search_path = '' as $$
  select e.* from public.tbl_events e
  where (p_after_id is null or e.id < p_after_id)
    and private.viewer_can_post_activity_vibe(e.id)
  order by e.id desc limit greatest(1, least(coalesce(p_limit, 51), 51));
$$;
revoke all on function public.list_eligible_vibe_activities(integer, integer) from public, anon;
grant execute on function public.list_eligible_vibe_activities(integer, integer) to authenticated;

create or replace function private.enforce_vibe_activity_eligibility()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.event_id is not distinct from old.event_id and new.user_id is not distinct from old.user_id then return new; end if;
  end if;
  -- Trusted server maintenance retains its existing access. Authenticated app calls
  -- (including SECURITY DEFINER RPCs) still carry the real auth.uid().
  if auth.uid() is null and auth.role() = 'service_role' then return new; end if;
  if new.event_id is not null and not private.viewer_can_post_activity_vibe(new.event_id::integer) then
    raise exception 'Join or host this activity before posting a Vibe.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_vibe_activity_eligibility() from public, anon, authenticated;
create trigger enforce_vibe_activity_eligibility before insert or update of event_id, user_id
on public.tbl_activity_vibes for each row execute function private.enforce_vibe_activity_eligibility();
