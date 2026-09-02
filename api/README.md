# WeNitro Community API Routes

The Expo demo uses the same resource shapes locally through AsyncStorage. These routes are the backend contract for a Supabase/PostgreSQL deployment. Authentication is a Supabase JWT in `Authorization: Bearer <token>` and PostgreSQL RLS remains the final authorization boundary.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v1/communities` | Search and filter all, joined, or created communities |
| POST | `/api/v1/communities` | Create a community and its initial admin membership |
| GET | `/api/v1/communities/:communityId` | Fetch identity, membership, rules, and aggregate counts |
| PATCH | `/api/v1/communities/:communityId` | Update owner-managed community fields |
| DELETE | `/api/v1/communities/:communityId` | Delete an owner-managed community |
| POST | `/api/v1/communities/:communityId/membership` | Join or request access |
| DELETE | `/api/v1/communities/:communityId/membership` | Leave a community |
| GET | `/api/v1/communities/:communityId/posts` | Paginated community feed with reaction/comment counts |
| POST | `/api/v1/communities/:communityId/posts` | Publish a post as an active member |
| PATCH | `/api/v1/community-posts/:postId` | Edit an authored post |
| DELETE | `/api/v1/community-posts/:postId` | Remove an authored or owner-moderated post |
| PUT | `/api/v1/community-posts/:postId/reaction` | Upsert the current user's reaction |
| DELETE | `/api/v1/community-posts/:postId/reaction` | Remove the current user's reaction |
| GET | `/api/v1/community-posts/:postId/comments` | Read threaded comments |
| POST | `/api/v1/community-posts/:postId/comments` | Add a comment or reply |
| POST | `/api/v1/uploads/community-image` | Return a signed upload target for avatar/cover media |
| GET | `/api/v1/conversations` | List the current user's people and group conversations |
| POST | `/api/v1/conversations` | Create a direct conversation or group and its memberships |
| GET | `/api/v1/conversations/:conversationId/messages` | Cursor-paginate visible messages for a member |
| POST | `/api/v1/conversations/:conversationId/messages` | Send text or uploaded media to a conversation |
| POST | `/api/v1/conversations/:conversationId/members` | Add a member to an owner/admin-managed group |
| DELETE | `/api/v1/conversations/:conversationId/members/:userId` | Leave or remove a group member |
| GET | `/api/v1/stories` | Read active public/followed stories with view state |
| POST | `/api/v1/stories` | Publish an image or video story for 24 hours |
| PUT | `/api/v1/stories/:storyId/view` | Upsert the current user's story view receipt |
| DELETE | `/api/v1/stories/:storyId` | Delete the current user's story |

## Query contract

`GET /api/v1/communities?q=food&scope=joined&category=Food%20%26%20Drinks&cursor=...&limit=20`

`GET /api/v1/communities/:communityId/posts?category=Travel&cursor=...&limit=20`

`GET /api/v1/conversations/:conversationId/messages?cursor=...&limit=40`

Conversation list responses include `kind`, `members`, `lastMessage`, `unreadCount`, and `updatedAt`. Message sends accept `{ body, mediaUrl, mediaType, replyToId }`. Group creation accepts `{ kind: "group", name, memberIds }`; direct creation accepts `{ kind: "direct", memberIds: [userId] }`.

Responses use `{ data, error, meta }`. Collection metadata includes `nextCursor` and `total` when available. Mutations should use an `Idempotency-Key` header so mobile retries do not create duplicate communities or posts.

The machine-readable contract is in `openapi.yaml`. Database ownership, indexes, checks, and RLS policies are in `database/schema.sql`; deterministic lookup and conditional demo records are in `database/seed.sql`.
