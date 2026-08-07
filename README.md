# ChinaSuuq 🛍️

**China-to-Somalia e-commerce marketplace.**

Browse millions of products from 1688, Taobao, and YiwuGo with live translation, CNY→USD conversion, and a unified cart. Air or sea freight to Hargeisa, Mogadishu, Bosaso and more.

## Monorepo structure

```
apps/web      Next.js 16 static-export web app (landing + full admin CRUD)
apps/mobile   Expo SDK 54 mobile app (offline-first, local data layer)
packages/shared  Shared types, error handling, api-client, hooks
```

## Stack

- Web: Next.js 16, React 19, Tailwind v4, framer-motion, zustand, @supabase/ssr
- Mobile: Expo SDK 54, React Native, AsyncStorage local-first, expo-image
- Backend: Supabase (Postgres + Auth + RLS)

## Brand

- Primary orange `#FF5A0A` · black `#111111` · warm white `#FFFCF8`
- Bilingual **English / Somali (af-Soomaali)**

## Deploy

- Web auto-deploys to Vercel on push to `main` (from the root; Vercel builds `apps/web`).
- Supabase backend: `athkmrvsaijwgsyvwrbp.supabase.co`

## Local dev

```bash
# web
cd apps/web && npm run dev

# mobile
cd apps/mobile && npx expo start
```

© 2026 ChinaSuuq · [baane122](https://github.com/baane122)
