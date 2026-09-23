-- The join-request SELECT policy calls this private, authorization-aware helper.
-- Granting EXECUTE is required for policy evaluation; the private schema is not
-- exposed through the Data API and the function only returns permission state.
grant execute on function private.community_can_approve(integer) to authenticated;
