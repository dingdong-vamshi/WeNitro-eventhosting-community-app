-- This is a trigger-only helper.  Client roles never need to invoke it
-- directly, so remove PostgreSQL's default PUBLIC execute privilege.
revoke all on function private.sync_activity_chat_member() from public;
revoke all on function private.sync_activity_chat_member() from anon;
revoke all on function private.sync_activity_chat_member() from authenticated;
