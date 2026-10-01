-- Old client calls do not carry an anonymity choice, so keep them named.
-- No Show continues to use the same eligibility and reward ledger rules.
create or replace function private.save_participant_rating(
  p_event_id integer,p_user_id integer,p_behaviour integer,p_friendly integer,
  p_communication integer,p_comment text,p_no_show boolean)
returns jsonb language sql security definer set search_path='' as $$
  select private.save_participant_rating(p_event_id,p_user_id,p_behaviour,
    p_friendly,p_communication,p_comment,p_no_show,false);
$$;
revoke all on function private.save_participant_rating(integer,integer,integer,integer,integer,text,boolean)
  from public,anon,authenticated;
