-- Remove redundant standalone indexes while preserving their constraint-backed twins.
-- This reduces insert/update overhead without changing uniqueness or query coverage.

drop index if exists public.tbl_chat_participants_room_user_uidx;
drop index if exists public.idx_reactions_event;
drop index if exists public.idx_reactions_user;
drop index if exists public.tbl_event_feedback_event_author_unique;
