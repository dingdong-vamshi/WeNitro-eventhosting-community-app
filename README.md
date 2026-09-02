# WeNitro Module

Intent-network Expo React Native app for finding the right people to do something with.

## Run

```bash
npm install
npm run web
npm run ios
npm run android
```

## What is included

- Login, signup, password validation, Google CTA, and legal text.
- Onboarding with profile fields, gender choices, interests, and Get Started.
- Main tabs: Feed, Vibes, Host, Chat, Profile.
- Intent discovery: study buddies, badminton partners, cricket teams, football, coffee, and nearby shared plans.
- Functional Feed tags, match detail pages, join state, Reels-style Vibes, story viewer, chat segments, message threads, and local optimistic sending.
- Depth-styled buttons and navigation icons, click tones on web with native haptic fallback, and a persisted profile-photo picker.
- Host flows: create a study/sports intent, post a vibe, create a community, and host a tournament-style plan.
- Nested modules: Search, Notifications, Explore Communities, Edit Profile, Settings, Privacy, Cookies, Terms, Privacy Policy, Help Chat, Feedback, Phone, Emergency Contact, Social Links, Verification, Shop, Activity History, Nitro History, Saved, and Liked.
- Local persisted demo data via AsyncStorage.

## Data note

Expo clients should not connect directly to PostgreSQL. This build uses a versioned AsyncStorage-backed intent database so the workflows work on web, iOS, and Android today. Chat threads currently use local optimistic state; a real tRPC/WebSocket transport still needs the API/auth/signaling service and connection URL before it can be safely enabled for production users.
