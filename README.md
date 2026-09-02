# WeNitro

WeNitro is a social activity and community application in active development, with production Supabase integration.

## Product areas

- Activity discovery and hosting
- Participant joining and host approval
- Communities and community discussions
- Vibes and Stories
- Profiles, interests, privacy, and verification
- Realtime chat and in-app notifications

## Technology

- Expo SDK 57
- React Native and React Native Web
- TypeScript
- Supabase Auth, Postgres, Realtime, and Storage

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add the public Supabase project URL and publishable key.
3. Run `npm ci`.
4. Run `npm run web` for web development or `npm start` for Expo development.

## Checks

- `npx tsc --noEmit`
- `npm run vercel-build`

The application targets the existing WeNitro legacy integer-ID `tbl_*` schema. Current migrations are in `supabase/migrations/`; incompatible historical UUID migrations are retained separately in `supabase/migrations_archive/`.
