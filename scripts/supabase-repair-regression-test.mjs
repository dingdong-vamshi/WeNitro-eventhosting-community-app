import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const rating = read('supabase/migrations/20260930161000_restore_participant_rating_reward.sql');
assert.match(rating, /on conflict\(user_id, rating_id\) do nothing/i);
assert.match(rating, /'points_awarded'/);

const membership = read('supabase/migrations/20260930162000_community_member_removal.sql');
assert.match(membership, /private\.community_manager\(p_room_id\)/);
assert.match(membership, /community creator cannot be removed/i);
assert.match(membership, /grant execute on function public\.community_remove_member/i);

const blocking = read('supabase/migrations/20260930163000_keep_chat_history_readable_after_block.sql');
const membershipGuard = blocking.match(/create or replace function public\.assert_chat_membership[\s\S]*?\$\$;/i)?.[0] || '';
assert.doesNotMatch(membershipGuard, /users_blocked/i, 'Membership checks must keep history readable after a block');
assert.match(blocking, /private\.users_blocked\(me, other_user\)/i);

const polls = read('supabase/migrations/20260930164000_personal_chat_polls.sql');
assert.match(polls, /room_type in \('personal', 'community', 'group'\)/i);

const service = read('src/services/communities-production.ts');
assert.match(service, /supabase\.rpc\('community_remove_member'/);
const communityUi = read('src/components/community/community-info.tsx');
assert.match(communityUi, /Remove member/);

console.log('PASS: Supabase repair migrations preserve one-time rating rewards, audited Community removal, readable blocked history, personal polls, and the Community removal UI.');
