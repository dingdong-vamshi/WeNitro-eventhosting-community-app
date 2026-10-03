-- Reviewers need the recorded version/time; approval does not create consent.
-- Existing owner-only reads and restrictive account guards remain in force.
create policy partner_terms_admin_read
on public.tbl_partner_terms_acceptances for select to authenticated
using ((select public.is_wenitro_admin()));
