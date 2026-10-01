-- Omit cancelled/deleted activity rooms while preserving their stored history.
do $$
declare original text; revised text;
begin
 select pg_get_functiondef('public.list_chat_inbox(integer)'::regprocedure) into original;
 revised:=replace(original,'where cp.user_id=v_user_id',
   'where cp.user_id=v_user_id and (r.event_id is null or exists (select 1 from public.tbl_events e where e.id=r.event_id and not coalesce(e.is_deleted,false) and not coalesce(e.is_cancelled,false) and e.status<>''cancelled''))');
 if revised=original then raise exception 'Unexpected inbox contract; inspect before applying'; end if;
 execute revised;
end $$;
