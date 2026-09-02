alter table public.tbl_users add column if not exists onboarding_completed boolean not null default false;
update public.tbl_users set onboarding_completed=true where onboarding_completed=false;
