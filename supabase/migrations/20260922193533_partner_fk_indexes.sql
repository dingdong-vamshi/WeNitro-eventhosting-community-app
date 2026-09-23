-- Cover Partner V1 foreign keys used by operations and audit lookups.
create index activity_payments_partner_idx on public.tbl_activity_payments(partner_user_id,created_at desc)
  where partner_user_id is not null;
create index partner_history_actor_idx on public.tbl_partner_application_history(actor_user_id)
  where actor_user_id is not null;
create index partner_history_auth_actor_idx on public.tbl_partner_application_history(actor_auth_user_id)
  where actor_auth_user_id is not null;
create index partner_finance_audit_actor_idx on public.tbl_partner_finance_audit(actor_user_id,created_at desc)
  where actor_user_id is not null;
create index partner_finance_audit_auth_actor_idx on public.tbl_partner_finance_audit(actor_auth_user_id,created_at desc)
  where actor_auth_user_id is not null;
create index partner_config_updated_by_idx on public.tbl_partner_finance_config(updated_by)
  where updated_by is not null;
create index partner_config_updated_by_auth_idx on public.tbl_partner_finance_config(updated_by_auth_user_id)
  where updated_by_auth_user_id is not null;
create index partner_config_history_changed_by_idx on public.tbl_partner_finance_config_history(changed_by)
  where changed_by is not null;
create index partner_config_history_changed_by_auth_idx on public.tbl_partner_finance_config_history(changed_by_auth_user_id)
  where changed_by_auth_user_id is not null;
create index partner_financial_events_event_idx on public.tbl_partner_financial_events(event_id,created_at desc);
create index partner_financial_events_participant_idx on public.tbl_partner_financial_events(participant_user_id,created_at desc)
  where participant_user_id is not null;
create index partner_financial_events_created_by_idx on public.tbl_partner_financial_events(created_by)
  where created_by is not null;
create index partner_financial_events_created_by_auth_idx on public.tbl_partner_financial_events(created_by_auth_user_id)
  where created_by_auth_user_id is not null;
create index partner_payout_reviewer_idx on public.tbl_partner_payout_accounts(reviewed_by)
  where reviewed_by is not null;
create index partner_payout_auth_reviewer_idx on public.tbl_partner_payout_accounts(reviewed_by_auth_user_id)
  where reviewed_by_auth_user_id is not null;
create index partner_profile_reviewer_idx on public.tbl_partner_profiles(reviewed_by)
  where reviewed_by is not null;
create index partner_profile_auth_reviewer_idx on public.tbl_partner_profiles(reviewed_by_auth_user_id)
  where reviewed_by_auth_user_id is not null;
create index partner_settlement_updated_by_idx on public.tbl_partner_settlements(updated_by)
  where updated_by is not null;
create index partner_settlement_updated_by_auth_idx on public.tbl_partner_settlements(updated_by_auth_user_id)
  where updated_by_auth_user_id is not null;
