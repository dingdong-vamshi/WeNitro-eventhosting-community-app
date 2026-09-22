-- Recover only deterministic legacy profile links. Ambiguous or unmatched
-- identities are intentionally untouched; no Auth or application users are created.
with candidates as (
  select u.id app_user_id,a.id auth_user_id,
    count(*) over(partition by u.id) app_candidates,
    count(*) over(partition by a.id) auth_candidates
  from public.tbl_users u
  join auth.users a on lower(btrim(a.email))=lower(btrim(u.email))
  where u.auth_user_id is null
    and nullif(btrim(u.email),'') is not null
), safe_links as (
  select app_user_id,auth_user_id from candidates c
  where c.app_candidates=1 and c.auth_candidates=1
    and not exists(select 1 from public.tbl_users linked where linked.auth_user_id=c.auth_user_id)
)
update public.tbl_users u
set auth_user_id=s.auth_user_id,
    onboarding_completed=coalesce(u.onboarding_completed,true)
from safe_links s
where u.id=s.app_user_id and u.auth_user_id is null;
