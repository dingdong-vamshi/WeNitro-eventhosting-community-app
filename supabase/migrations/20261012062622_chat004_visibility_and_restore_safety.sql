-- Moderate published private content too. Keep restoration scoped to the audited Admin RPC.
create or replace function private.guard_moderated_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare field text; value text; previous text; cover text; old_cover text; became_public boolean;
begin
 if new.status<>'published' then return new;end if;
 -- Only the audited Admin RPC may restore an unchanged, previously canceled row.
 -- This does not permit any edited title, description, location or media to bypass checks.
 if tg_op='UPDATE' and old.status='cancelled' and public.is_wenitro_admin()
    and current_setting('wenitro.admin_restore_activity',true)=new.id::text
    and (to_jsonb(new)-array['status','is_deleted','is_cancelled','admin_moderation_status','admin_moderation_reason','admin_moderated_at','admin_moderated_by','updated_at'])
      is not distinct from (to_jsonb(old)-array['status','is_deleted','is_cancelled','admin_moderation_status','admin_moderation_reason','admin_moderated_at','admin_moderated_by','updated_at'])
 then return new;end if;
 became_public:=tg_op<>'UPDATE' or old.status is distinct from 'published' or old.visibility_type is distinct from 'public';
 foreach field in array array['title','description','location_instruction','display_location'] loop
  value:=coalesce(to_jsonb(new)->>field,'');previous:=case when tg_op='UPDATE' then coalesce(to_jsonb(old)->>field,'') else null end;
  if became_public or value is distinct from previous then perform private.require_safe_moderation('activity',field,value,'text');end if;
 end loop;
 cover:=coalesce(new.media->0->>'url','');old_cover:=case when tg_op='UPDATE' then coalesce(old.media->0->>'url','') else null end;
 if (became_public or cover is distinct from old_cover) and cover<>'' then perform private.require_safe_moderation('activity','cover_path',cover,'image');end if;
 return new;
end $$;

create or replace function private.guard_moderated_community() returns trigger language plpgsql security definer set search_path='' as $$
declare field text; value text; previous text; became_public boolean;
begin
 if new.room_type<>'community' then return new;end if;
 became_public:=tg_op<>'UPDATE' or old.room_type is distinct from 'community' or coalesce(old.visibility,'public') is distinct from 'public';
 foreach field in array array['title','tagline','description','tags','rules'] loop
  value:=private.moderation_array_text(to_jsonb(new)->field);previous:=case when tg_op='UPDATE' then private.moderation_array_text(to_jsonb(old)->field) else null end;
  if became_public or value is distinct from previous then perform private.require_safe_moderation('community',field,value,'text');end if;
 end loop;
 foreach field in array array['image_url','cover_url'] loop
  value:=coalesce(to_jsonb(new)->>field,'');previous:=case when tg_op='UPDATE' then coalesce(to_jsonb(old)->>field,'') else null end;
  if (became_public or value is distinct from previous) and value<>'' then perform private.require_safe_moderation('community',case field when 'image_url' then 'image_path' else 'cover_path' end,value,'image');end if;
 end loop;
 return new;
end $$;

-- Host Delete persists both a flag and a status. Restore must reverse both.
create or replace function public.admin_moderate_activity(p_event_id integer,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.tbl_events%rowtype; old_state jsonb; new_state jsonb; count_sent integer:=0;
begin
 if not public.is_wenitro_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if p_action is null or p_action not in ('warn_host','hide_event','unhide_event','cancel_event','suspend_host','delete_event','restore_event','notify_participants') then raise exception 'Invalid moderation action';end if;
 if length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>1000 then raise exception 'A reason or message of 5–1000 characters is required';end if;
 select * into e from public.tbl_events where id=p_event_id for update;
 if not found then raise exception 'Activity unavailable';end if;
 if (p_action='cancel_event' and coalesce(e.is_cancelled,false))
    or (p_action='delete_event' and coalesce(e.is_deleted,false))
    or (p_action='hide_event' and e.admin_moderation_status='hidden')
    or (p_action='unhide_event' and e.admin_moderation_status='active' and e.status is distinct from 'cancelled')
    or (p_action='restore_event' and not coalesce(e.is_deleted,false) and not coalesce(e.is_cancelled,false) and e.admin_moderation_status='active' and e.status is distinct from 'cancelled')
 then return jsonb_build_object('id',e.id,'changed',false,'notifications',0);end if;
 old_state:=jsonb_build_object('is_deleted',e.is_deleted,'is_cancelled',e.is_cancelled,'status',e.status,'admin_moderation_status',e.admin_moderation_status);
 if p_action='suspend_host' then perform public.admin_moderate_user(e.created_by,'30d',p_reason);
 elsif p_action='hide_event' then update public.tbl_events set admin_moderation_status='hidden',admin_moderation_reason=btrim(p_reason),admin_moderated_at=now(),admin_moderated_by=auth.uid(),is_admin_pinned=false,updated_at=now() where id=e.id;
 elsif p_action='unhide_event' then update public.tbl_events set admin_moderation_status='active',admin_moderation_reason=btrim(p_reason),admin_moderated_at=now(),admin_moderated_by=auth.uid(),updated_at=now() where id=e.id;
 elsif p_action='cancel_event' then update public.tbl_events set is_cancelled=true,is_admin_pinned=false,admin_moderation_reason=btrim(p_reason),admin_moderated_at=now(),admin_moderated_by=auth.uid(),updated_at=now() where id=e.id;
 elsif p_action='delete_event' then update public.tbl_events set is_deleted=true,is_admin_pinned=false,admin_moderation_status='removed',admin_moderation_reason=btrim(p_reason),admin_moderated_at=now(),admin_moderated_by=auth.uid(),updated_at=now() where id=e.id;
 elsif p_action='restore_event' then
  if exists(select 1 from public.tbl_activity_payments where event_id=e.id and status in ('paid','success')) then raise exception 'Paid activity restoration requires financial reconciliation';end if;
  perform set_config('wenitro.admin_restore_activity',e.id::text,true);
  update public.tbl_events set is_deleted=false,is_cancelled=false,status=case when status='cancelled' then 'published' else status end,admin_moderation_status='active',admin_moderation_reason=btrim(p_reason),admin_moderated_at=now(),admin_moderated_by=auth.uid(),updated_at=now() where id=e.id;
  perform set_config('wenitro.admin_restore_activity','',true);
 end if;
 if p_action in ('warn_host','suspend_host','hide_event') then
  insert into public.tbl_notifications(user_id,sender_id,type,reference_id,title,body,data)
  values(e.created_by,public.current_app_user_id(),'system',e.id::text,'WeNitro activity moderation',p_reason,jsonb_build_object('eventId',e.id));count_sent:=1;
 elsif p_action in ('cancel_event','delete_event','notify_participants') then
  insert into public.tbl_notifications(user_id,sender_id,type,reference_id,title,body,data)
  select u,public.current_app_user_id(),'system',e.id::text,
   case p_action when 'cancel_event' then 'Activity cancelled' when 'delete_event' then 'Activity removed' else 'Activity update' end,
   e.title||': '||p_reason,jsonb_build_object('eventId',e.id)
  from(select e.created_by u union select user_id from public.tbl_event_participants where event_id=e.id and lower(status) in ('approved','joined','confirmed','registered')) recipients;
  get diagnostics count_sent=row_count;
 end if;
 select jsonb_build_object('is_deleted',is_deleted,'is_cancelled',is_cancelled,'status',status,'admin_moderation_status',admin_moderation_status) into new_state from public.tbl_events where id=e.id;
 insert into private.admin_operation_audit(actor_id,target_type,target_id,action,reason,previous_state,next_state)
 values(auth.uid(),'activity',e.id,p_action,btrim(p_reason),old_state,new_state||jsonb_build_object('notifications',count_sent));
 return jsonb_build_object('id',e.id,'action',p_action,'notifications',count_sent,'moderation_status',new_state->>'admin_moderation_status');
end $$;


notify pgrst,'reload schema';
