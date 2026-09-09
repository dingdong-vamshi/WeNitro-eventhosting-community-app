create or replace function public.update_activity_comment(
  p_comment_id bigint,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.get_current_app_user_id();
  v_comment public.tbl_event_comments;
  v_author public.tbl_users;
begin
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'Comment must contain 1 to 2000 characters';
  end if;

  update public.tbl_event_comments
  set body = trim(p_body), updated_at = now()
  where id = p_comment_id
    and deleted_at is null
    and (user_id = v_user_id or public.is_wenitro_admin())
  returning * into v_comment;

  if v_comment.id is null then
    raise exception 'Comment is unavailable' using errcode = '42501';
  end if;

  select * into v_author from public.tbl_users where id = v_comment.user_id;
  return to_jsonb(v_comment) || jsonb_build_object(
    'author', jsonb_build_object(
      'id', v_author.id,
      'username', v_author.username,
      'fullname', v_author.fullname,
      'profile_image', v_author.profile_image
    )
  );
end
$$;

revoke execute on function public.update_activity_comment(bigint, text)
from public, anon;
grant execute on function public.update_activity_comment(bigint, text)
to authenticated;
