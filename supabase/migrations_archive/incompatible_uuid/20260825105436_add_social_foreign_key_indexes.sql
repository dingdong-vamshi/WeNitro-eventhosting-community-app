create index if not exists idx_chat_conversations_activity_fk on public.chat_conversations(activity_id);
create index if not exists idx_chat_conversations_community_fk on public.chat_conversations(community_id);
create index if not exists idx_chat_messages_reply_fk on public.chat_messages(reply_to_id);
create index if not exists idx_community_post_comments_parent_fk on public.community_post_comments(parent_id);
create index if not exists idx_content_reports_reporter_fk on public.content_reports(reporter_id);
create index if not exists idx_content_reports_subject_fk on public.content_reports(subject_user_id);
create index if not exists idx_content_reports_vibe_fk on public.content_reports(vibe_id);
create index if not exists idx_content_reports_post_fk on public.content_reports(community_post_id);
create index if not exists idx_content_reports_message_fk on public.content_reports(message_id);
create index if not exists idx_content_shares_user_fk on public.content_shares(user_id);
create index if not exists idx_content_shares_post_fk on public.content_shares(community_post_id);
create index if not exists idx_data_subject_requests_user_fk on public.data_subject_requests(user_id);
create index if not exists idx_likes_activity_fk on public.likes(activity_id);
create index if not exists idx_likes_vibe_fk on public.likes(vibe_id);
create index if not exists idx_saves_activity_fk on public.saves(activity_id);
create index if not exists idx_saves_vibe_fk on public.saves(vibe_id);
create index if not exists idx_user_blocks_blocked_fk on public.user_blocks(blocked_id);
create index if not exists idx_vibe_comments_author_fk on public.vibe_comments(author_id);
create index if not exists idx_vibe_comments_parent_fk on public.vibe_comments(parent_id);

drop policy if exists "community reactions manage self" on public.community_post_reactions;
create policy "community reactions insert self" on public.community_post_reactions
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "community reactions update self" on public.community_post_reactions
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "community reactions delete self" on public.community_post_reactions
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "community rules manage owner" on public.community_rules;
create policy "community rules insert owner" on public.community_rules
for insert to authenticated with check (exists (select 1 from public.communities c where c.id = community_id and c.owner_id = (select auth.uid())));
create policy "community rules update owner" on public.community_rules
for update to authenticated using (exists (select 1 from public.communities c where c.id = community_id and c.owner_id = (select auth.uid())))
with check (exists (select 1 from public.communities c where c.id = community_id and c.owner_id = (select auth.uid())));
create policy "community rules delete owner" on public.community_rules
for delete to authenticated using (exists (select 1 from public.communities c where c.id = community_id and c.owner_id = (select auth.uid())));
