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
 -- Reopening an invitation after a verified payment must not downgrade an
 -- admitted participant back to payment_required or consume another use.
 if position('or (invite.max_uses is not null and invite.uses_count>=invite.max_uses)' in definition)=0 then raise exception 'Unexpected invite use-limit contract';end if;
 definition:=replace(definition,'or (invite.max_uses is not null and invite.uses_count>=invite.max_uses)','');
 if position('  if event_row.max_participants is not null' in definition)=0 then raise exception 'Unexpected invite capacity contract';end if;
 definition:=replace(definition,'  if event_row.max_participants is not null',$replay$
  select * into participation from public.tbl_event_participants
    where event_id=event_row.id and user_id=me for update;
  if participation.status in ('approved','going','paid')
     and event_row.is_paid and event_row.payment_collection_mode='cashfree'
     and exists(select 1 from public.tbl_activity_payments payment
       where payment.event_id=event_row.id and payment.user_id=me
         and payment.status='paid' and payment.financial_status in ('PAYABLE','SETTLED','ON_HOLD')) then
    return jsonb_build_object('event_id',event_row.id,'status',participation.status);
  end if;
  if invite.max_uses is not null and invite.uses_count>=invite.max_uses then
    raise exception 'Invite link is invalid or expired' using errcode='42501';
  end if;
  if event_row.max_participants is not null$replay$);
 execute definition;
end $$;
