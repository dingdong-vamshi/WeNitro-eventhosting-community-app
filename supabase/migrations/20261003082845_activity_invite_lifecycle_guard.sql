-- An invitation conveys Host approval, but cannot reopen a closed Activity.
-- Keep free invite approval and Cashfree payment-required semantics unchanged.
do $$ declare definition text; begin
 select pg_get_functiondef('public.create_activity_invite(integer,timestamptz,integer)'::regprocedure) into definition;
 if position(E'begin\n' in definition)=0 then raise exception 'Unexpected invite creation contract';end if;
 definition:=replace(definition,E'begin\n',E'begin\n  perform private.assert_activity_mutable(p_event_id);\n  if exists(select 1 from public.tbl_events where id=p_event_id and registration_close_time is not null and registration_close_time<=now()) then raise exception ''Registration is closed'' using errcode=''42501'';end if;\n');
 execute definition;

 select pg_get_functiondef('public.redeem_activity_invite(text)'::regprocedure) into definition;
 if position('  if event_row.created_by=me then' in definition)=0 then raise exception 'Unexpected invite redemption contract';end if;
 definition:=replace(definition,'  if event_row.created_by=me then',$guard$
  perform private.assert_activity_mutable(event_row.id);
  if event_row.registration_close_time is not null and event_row.registration_close_time<=now() then
    raise exception 'Registration is closed' using errcode='42501';
  end if;
  if event_row.created_by=me then$guard$);
 execute definition;
end $$;
