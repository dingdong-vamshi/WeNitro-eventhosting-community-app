-- Complete-set replacement is one transaction. New disabled interests are
-- rejected by the catalog trigger; previously selected archived IDs stay put.
CREATE OR REPLACE FUNCTION public.set_my_interests(p_category_ids integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id integer := public.get_current_app_user_id();
  v_ids integer[];
  v_valid integer;
  v_items jsonb;
begin
  -- Serialize complete replacements for one member across concurrent tabs.
  perform 1 from public.tbl_users where id=v_user_id for update;
  select coalesce(array_agg(distinct x), '{}'::integer[])
  into v_ids
  from unnest(coalesce(p_category_ids, '{}'::integer[])) x;

  if cardinality(v_ids) > 50 or exists (select 1 from unnest(v_ids) x where x <= 0) then
    raise exception 'Select between 0 and 50 valid interests';
  end if;

  select count(*) into v_valid
  from public.tbl_categories c
  where c.id = any(v_ids);
  if v_valid <> cardinality(v_ids) then
    raise exception 'One or more interests are unavailable';
  end if;

  delete from public.tbl_user_interests
  where user_id = v_user_id and not (category_id = any(v_ids));

  insert into public.tbl_user_interests(user_id, category_id)
  select v_user_id, x
  from unnest(v_ids) x
  where not exists (
    select 1 from public.tbl_user_interests ui
    where ui.user_id = v_user_id and ui.category_id = x
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'slug', lower(regexp_replace(trim(c.name), '[^A-Za-z0-9]+', '-', 'g')),
    'name', c.name,
    'icon', nullif(c.icon,''),
    'selected_at', ui.created_at
  ) order by c.name, c.id), '[]'::jsonb)
  into v_items
  from public.tbl_user_interests ui
  join public.tbl_categories c on c.id = ui.category_id
  where ui.user_id = v_user_id;

  return v_items;
end
$function$
;
revoke all on function public.set_my_interests(integer[]) from public,anon;
grant execute on function public.set_my_interests(integer[]) to authenticated;
