-- Allow Admin category correction using existing categories and one atomic transaction.
create or replace function public.admin_correct_activity_category(p_event_id integer,p_category_id integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me integer; category_name text;
begin
  if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  me:=public.get_current_app_user_id();
  perform 1 from public.tbl_events where id=p_event_id and not coalesce(is_deleted,false) for update;
  if not found then raise exception 'Activity unavailable'; end if;
  select name into category_name from public.tbl_categories where id=p_category_id;
  if not found then raise exception 'Choose an existing category'; end if;
  delete from public.tbl_event_categories where event_id=p_event_id;
  insert into public.tbl_event_categories(event_id,category_id,created_by,updated_by)
  values(p_event_id,p_category_id,me,me);
  update public.tbl_events set updated_by=me,updated_at=now() where id=p_event_id;
  return jsonb_build_object('event_id',p_event_id,'category_id',p_category_id,'category',category_name);
end $$;
revoke all on function public.admin_correct_activity_category(integer,integer) from public,anon;
grant execute on function public.admin_correct_activity_category(integer,integer) to authenticated;
