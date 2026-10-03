-- Profile count must use the same unique, active, non-self audience as Squad.
-- Patch only this expression, retaining current identity and all other metrics.
do $$ declare definition text; old_count text := '(select count(distinct case when f.user_id=me then f.friend_id else f.user_id end) from public.tbl_friends f where f.user_id=me or f.friend_id=me)'; begin
 select pg_get_functiondef('private.my_profile_metrics()'::regprocedure) into definition;
 if position(old_count in definition)=0 then raise exception 'Unexpected profile Squad metric contract'; end if;
 execute replace(definition,old_count,'jsonb_array_length(public.list_my_squad())');
end $$;
