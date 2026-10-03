-- Scoped CHAT001 fixture: ended QA Activity233 (Host70), approved participant71.
-- No DDL, no sequence consumption, no permanent row, rating or reward mutation.
-- Every attempted write is inside a deliberately aborted subtransaction, and
-- outer ROLLBACK is a second safeguard. No existing comment content is read.
begin;
do $$
declare rejected boolean:=false; results jsonb;
begin
 if not exists(select 1 from public.tbl_events where id=233 and created_by=70 and event_end_time<now() and not is_deleted and not is_cancelled and (title like '[QA]%' or title like 'QA %')) then raise exception 'Controlled ended QA Activity unavailable'; end if;
 if not exists(select 1 from public.tbl_event_participants where event_id=233 and user_id=71 and status='approved') then raise exception 'Controlled approved participant unavailable'; end if;
 if exists(select 1 from public.tbl_event_feedback where id=-103032054 or (event_id=233 and created_by=71)) then raise exception 'Rollback fixture key already used'; end if;
 if (select count(*) from pg_trigger where tgrelid='public.tbl_event_feedback'::regclass and not tgisinternal)<>1 or not exists(select 1 from pg_trigger where tgrelid='public.tbl_event_feedback'::regclass and not tgisinternal and tgname='guard_ugc_text' and tgenabled='O' and tgfoid='private.guard_ugc_text()'::regprocedure) then raise exception 'Unexpected feedback triggers; review before writing'; end if;
 begin
  insert into public.tbl_event_feedback(id,event_id,created_by,reaction,comment) values(-103032054,233,71,'good','[QA] rollback-only clean feedback');
  begin
   update public.tbl_event_feedback set comment='fuck PRIVATE_SENTINEL' where id=-103032054;
  exception when sqlstate '22023' then
   if sqlerrm<>'Please remove explicit or hateful language before saving.' then raise exception 'Unexpected moderation message'; end if;
   rejected:=true;
  end;
  if not rejected then raise exception 'Feedback text guard accepted forbidden value'; end if;
  if not exists(select 1 from public.tbl_event_feedback where id=-103032054 and comment='[QA] rollback-only clean feedback') then raise exception 'Rejected update did not preserve clean fixture'; end if;
  raise exception 'Rollback synthetic feedback fixture' using errcode='P1001';
 exception when sqlstate 'P1001' then null;
 end;
 if exists(select 1 from public.tbl_event_feedback where id=-103032054 or (event_id=233 and created_by=71)) then raise exception 'Feedback rollback failed'; end if;
 results:=jsonb_build_object('normal_insert','PASS: temporary synthetic row accepted','forbidden_comment_update','PASS: generic22023','rejected_update_atomic','PASS: clean temporary row preserved','cleanup','PASS: inserted row absent after subtransaction rollback','sequence_consumed',false,'rating_reward_mutations',false,'event_id',233,'participant_id',71);
 perform set_config('qa.feedback_guard_proof',results::text,true);
end $$;
select current_setting('qa.feedback_guard_proof')::jsonb as feedback_guard_proof;
rollback;
