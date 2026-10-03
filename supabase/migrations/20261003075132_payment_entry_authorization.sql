-- Every checkout path uses the same category, capacity and ended-state rules.
-- Locking the activity also serializes category edits against checkout creation.
do $$ declare definition text; signature text; begin
 foreach signature in array array[
  'public.prepare_activity_payment(integer,bigint)',
  'public.save_activity_entry_categories(integer,jsonb)'
 ] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  if position(E'begin\n' in definition)=0 then raise exception 'Unexpected function contract: %',signature;end if;
  definition:=replace(definition,E'begin\n',E'begin\n  perform private.assert_activity_mutable(p_event_id);\n');
  if signature='public.prepare_activity_payment(integer,bigint)' then
   definition:=replace(definition,E'begin\n',E'begin\n  if not exists(select 1 from auth.users where id=auth.uid() and phone_confirmed_at is not null and nullif(btrim(phone),'''') is not null) then raise exception ''A verified phone number is required for Cashfree checkout.'' using errcode=''42501'';end if;\n');
   definition:=replace(definition,'perform private.assert_activity_mutable(p_event_id);',$guard$
    perform private.assert_activity_mutable(p_event_id);
    if exists(select 1 from public.tbl_activity_payments previous where previous.event_id=p_event_id and previous.user_id=me and previous.status='paid' and previous.financial_status in ('REFUND_REQUIRED','DISPUTED')) then
      raise exception 'Your previous payment needs review. Contact support before paying again.' using errcode='42501';
    end if;$guard$);
   if position('p.status=''paid'' or (p.status in' in definition)=0 then raise exception 'Unexpected category capacity contract';end if;
   definition:=replace(definition,'p.status=''paid'' or (p.status in',
    '(p.status=''paid'' and coalesce(p.financial_status,''OPEN'') not in (''REFUND_REQUIRED'',''REFUNDED'',''REVERSED'',''DISPUTED'')) or (p.status in');
  end if;
  execute definition;
 end loop;
end $$;

-- Keep older clients compatible for activities without categories. Activities
-- with categories must select one; the old overload cannot bypass its price/cap.
create or replace function public.prepare_activity_payment(p_event_id integer)
returns public.tbl_activity_payments language sql security invoker set search_path='' as $$
 select public.prepare_activity_payment(p_event_id,null::bigint)
$$;
revoke all on function public.prepare_activity_payment(integer) from public,anon;
grant execute on function public.prepare_activity_payment(integer) to authenticated;

create or replace function public.list_activity_entry_categories(p_event_id integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; me integer:=public.get_current_app_user_id();
begin
 if auth.uid() is null or me is null then raise exception 'Authentication required' using errcode='42501';end if;
 if not private.registration_event_visible(p_event_id)
    and not private.can_manage_activity(p_event_id,me) then
  raise exception 'Activity is unavailable' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'name',c.name,'price_paisa',c.price_paisa,'capacity',c.capacity,'position',c.position
 ) order by c.position,c.id),'[]'::jsonb) into result
 from public.tbl_activity_entry_categories c where c.event_id=p_event_id and c.active;
 return result;
end $$;
revoke all on function public.list_activity_entry_categories(integer) from public,anon;
grant execute on function public.list_activity_entry_categories(integer) to authenticated;

-- A provider can confirm an older attempt after its reservation or activity
-- ended. Record the real payment while withholding the seat and queuing review.
do $$ declare definition text; begin
 select pg_get_functiondef('public.finalize_activity_payment(text,text,bigint,text,text,jsonb)'::regprocedure) into definition;
 if position('or coalesce(event_row.is_cancelled,false)' in definition)=0 or position('  update public.tbl_activity_payments set' in definition)=0 then raise exception 'Unexpected payment finalizer contract';end if;
 definition:=replace(definition,'or coalesce(event_row.is_cancelled,false)',
  'or coalesce(event_row.is_cancelled,false) or event_row.status<>''published'' or event_row.event_end_time<=now() or not private.has_active_partner(event_row.created_by) or not private.badge_valid_user(payment.user_id)');
 definition:=replace(definition,'  update public.tbl_activity_payments set',$guard$
  if exception_reason is null and payment.entry_category_id is not null and exists(
    select 1 from public.tbl_activity_entry_categories c where c.id=payment.entry_category_id and c.capacity is not null and c.capacity<=(
      select count(*) from public.tbl_activity_payments other where other.entry_category_id=c.id and other.id<>payment.id
       and ((other.status='paid' and coalesce(other.financial_status,'OPEN') not in ('REFUND_REQUIRED','REFUNDED','REVERSED','DISPUTED')) or (other.status in ('created','pending') and other.checkout_expires_at>now()))
    )
  ) then exception_reason:='CATEGORY_CAPACITY_UNAVAILABLE_AFTER_PAYMENT';end if;
  update public.tbl_activity_payments set$guard$);
 -- Accounting triggers and the refund queue may update financial_status after
 -- UPDATE ... RETURNING filled the local variable. Return the final ledger row.
 if position(E'  return payment;\nend' in definition)=0 then raise exception 'Unexpected payment finalizer return contract';end if;
 definition:=replace(definition,E'  return payment;\nend',E'  select p.* into payment from public.tbl_activity_payments p where p.id=payment.id;\n  return payment;\nend');
 execute definition;
end $$;
