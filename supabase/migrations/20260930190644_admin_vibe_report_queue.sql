-- Keep report tables private; expose the moderation queue only to Admin.
create or replace function public.admin_list_vibe_reports()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb)
 from (select id,vibe_id,reported_by,reason,details,status,created_at from public.tbl_vibe_reports where status in ('open','reviewing') order by created_at desc limit 500) r);
end $$;
create or replace function public.admin_review_vibe_report(p_report_id bigint,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_status not in ('reviewing','resolved','dismissed') then raise exception 'Invalid report status'; end if;
 update public.tbl_vibe_reports set status=p_status,updated_at=now() where id=p_report_id returning jsonb_build_object('id',id,'status',status) into result;
 if result is null then raise exception 'Report unavailable'; end if;
 return result;
end $$;
revoke all on function public.admin_list_vibe_reports() from public,anon;
revoke all on function public.admin_review_vibe_report(bigint,text) from public,anon;
grant execute on function public.admin_list_vibe_reports() to authenticated;
grant execute on function public.admin_review_vibe_report(bigint,text) to authenticated;
