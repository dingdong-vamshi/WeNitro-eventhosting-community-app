-- Existing QA account and activity only. Every field/relation change is rolled back.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f034763a-7b42-4e58-8fee-8ba4f3bdd59b","role":"authenticated"}',true);
do $$
declare me integer := public.get_current_app_user_id(); category integer; other_name text; denied boolean := false; changed integer;
begin
 if me <> 44 then raise exception 'QA identity mismatch'; end if;
 if not exists(select 1 from public.tbl_events where id=105 and title like '[QA]%') then raise exception 'QA activity guard failed'; end if;
 update public.tbl_users set bio='Profile persistence check',occupation='QA occupation',about='Transaction-only About You check.',nationality='FR' where id=me;
 if not exists(select 1 from public.tbl_users where id=me and bio='Profile persistence check' and occupation='QA occupation' and about='Transaction-only About You check.' and nationality='FR') then raise exception 'Profile field readback failed'; end if;
 update public.tbl_users set nationality=null where id=me;
 if not exists(select 1 from public.tbl_users where id=me and nationality is null) then raise exception 'Nationality clear failed'; end if;
 select username into other_name from public.tbl_users where id=35;
 if other_name is null then raise exception 'Username fixture unavailable'; end if;
 begin update public.tbl_users set username=other_name where id=me; exception when unique_violation then denied:=true; end;
 if not denied then raise exception 'Duplicate username accepted'; end if;
 update public.tbl_users set bio='must not persist' where id=35;
 get diagnostics changed=row_count; if changed<>0 then raise exception 'Other profile writable'; end if;
 select id into category from public.tbl_categories where trim(name)='Career' order by id limit 1;
 insert into public.tbl_user_interests(user_id,category_id) select me,category where not exists(select 1 from public.tbl_user_interests where user_id=me and category_id=category);
 if not exists(select 1 from public.tbl_user_interests where user_id=me and category_id=category) then raise exception 'Interest save failed'; end if;
 delete from public.tbl_user_interests where user_id=me and category_id=category;
 if exists(select 1 from public.tbl_user_interests where user_id=me and category_id=category) then raise exception 'Interest removal failed'; end if;
 insert into public.tbl_event_likes(event_id,user_id) values(105,me) on conflict do nothing;
 if not exists(select 1 from public.tbl_event_likes l join public.tbl_events e on e.id=l.event_id where l.event_id=105 and l.user_id=me) then raise exception 'Liked collection read failed'; end if;
 delete from public.tbl_event_likes where event_id=105 and user_id=me;
 if exists(select 1 from public.tbl_event_likes where event_id=105 and user_id=me) then raise exception 'Unlike failed'; end if;
 insert into public.tbl_event_saves(event_id,user_id) values(105,me) on conflict do nothing;
 if not exists(select 1 from public.tbl_event_saves s join public.tbl_events e on e.id=s.event_id where s.event_id=105 and s.user_id=me) then raise exception 'Saved collection read failed'; end if;
 delete from public.tbl_event_saves where event_id=105 and user_id=me;
 if exists(select 1 from public.tbl_event_saves where event_id=105 and user_id=me) then raise exception 'Unsave failed'; end if;
end $$;
rollback;
select 'PASS: profile readback, nationality clear, duplicate username rejection, owner isolation, interest toggle, like/unlike and save/unsave. All writes rolled back.' result;
