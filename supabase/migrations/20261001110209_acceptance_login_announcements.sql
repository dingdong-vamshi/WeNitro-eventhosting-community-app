-- Login announcements: explicit Admin authorization, bounded content, optional QA audience.
create table public.tbl_login_announcements (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  active boolean not null default true,
  target_user_ids integer[],
  created_by integer not null references public.tbl_users(id),
  created_at timestamptz not null default now(),
  check (expires_at > starts_at)
);
create table public.tbl_login_announcement_receipts (
  announcement_id bigint not null references public.tbl_login_announcements(id),
  user_id integer not null references public.tbl_users(id),
  read_at timestamptz not null default now(),
  primary key (announcement_id,user_id)
);
alter table public.tbl_login_announcements enable row level security;
alter table public.tbl_login_announcement_receipts enable row level security;
revoke all on public.tbl_login_announcements, public.tbl_login_announcement_receipts from anon,authenticated;
grant select on public.tbl_login_announcements, public.tbl_login_announcement_receipts to authenticated;
create policy announcement_admin_read on public.tbl_login_announcements for select to authenticated using (public.is_wenitro_admin());
create policy announcement_receipt_read on public.tbl_login_announcement_receipts for select to authenticated using (user_id=public.get_current_app_user_id() or public.is_wenitro_admin());

create function public.admin_create_login_announcement(p_title text,p_body text,p_starts_at timestamptz,p_expires_at timestamptz,p_target_user_ids integer[] default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
  if auth.uid() is null or not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_target_user_ids is not null and cardinality(p_target_user_ids)=0 then raise exception 'Select at least one recipient'; end if;
  insert into public.tbl_login_announcements(title,body,starts_at,expires_at,target_user_ids,created_by)
  values(trim(p_title),trim(p_body),p_starts_at,p_expires_at,p_target_user_ids,public.get_current_app_user_id()) returning id into result;
  return result;
end $$;
create function public.admin_disable_login_announcement(p_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  update public.tbl_login_announcements set active=false where id=p_id;
  if not found then raise exception 'Announcement not found'; end if;
end $$;
create function public.my_login_announcements()
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id(); result jsonb;
begin
  if auth.uid() is null or me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'body',a.body) order by a.id),'[]'::jsonb) into result
  from (select * from public.tbl_login_announcements a where active and starts_at<=now() and expires_at>now()
    and (target_user_ids is null or me=any(target_user_ids))
    and not exists(select 1 from public.tbl_login_announcement_receipts r where r.announcement_id=a.id and r.user_id=me)
    order by id limit 5) a;
  return result;
end $$;
create function public.acknowledge_login_announcement(p_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare me integer:=public.get_current_app_user_id();
begin
  if auth.uid() is null or me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.tbl_login_announcements where id=p_id and active and starts_at<=now() and expires_at>now() and (target_user_ids is null or me=any(target_user_ids))) then
    raise exception 'Announcement unavailable' using errcode='42501';
  end if;
  insert into public.tbl_login_announcement_receipts(announcement_id,user_id) values(p_id,me) on conflict do nothing;
end $$;
revoke all on function public.admin_create_login_announcement(text,text,timestamptz,timestamptz,integer[]),public.admin_disable_login_announcement(bigint),public.my_login_announcements(),public.acknowledge_login_announcement(bigint) from public,anon;
grant execute on function public.admin_create_login_announcement(text,text,timestamptz,timestamptz,integer[]),public.admin_disable_login_announcement(bigint),public.my_login_announcements(),public.acknowledge_login_announcement(bigint) to authenticated;
