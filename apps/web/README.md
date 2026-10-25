# ChinaSuuq Web

ChinaSuuq Web is a Next.js 16 application with static export for the ChinaSuuq logistics platform. It provides a responsive web interface for shipment tracking, quotes, and order management.

## Tech Stack

- **Framework**: Next.js 16 (App Router, static export)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + custom components
- **State Management**: Zustand v5
- **Database**: Supabase (PostgreSQL)
- **Internationalization**: next-intl or custom i18n
- **Deployment**: Vercel (static hosting)
- **Analytics**: Vercel Analytics + Sentry

## Quick Start

```bash
# Clone the monorepo
git clone <repository-url>
cd chinasuuq-new

# Install dependencies
pnpm install

# Set up environment variables
cp apps/web/.env.example apps/web/.env.local
# Edit .env.local with your Supabase credentials

# Start development server
pnpm dev --filter apps/web
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
apps/web/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication pages
│   ├── (marketing)/       # Marketing/landing pages
│   ├── api/               # API routes
│   └── layout.tsx         # Root layout
├── src/
│   ├── components/        # Reusable UI components
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utilities and clients
│   ├── store/             # Zustand stores
│   └── types/             # TypeScript types
├── public/                # Static assets
├── supabase/              # Supabase migrations and configs
├── next.config.ts         # Next.js configuration
├── vercel.json            # Vercel deployment config
└── tsconfig.json          # TypeScript configuration
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `dev` | Start development server |
| `build` | Build for production |
| `start` | Start production server |
| `lint` | Run ESLint |
| `type-check` | Type check without building |

## Environment Variables

See [.env.example](./.env.example) for required variables.

### Required Variables

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-side only)

### Optional Variables

- `NEXT_PUBLIC_DEV_BUILD` — Enable development mode
- `VERCEL_OIDC_TOKEN` — For edge functions

## Building for Production

```bash
# Build the web app
pnpm build --filter apps/web

# Output is generated in apps/web/out/
# This can be deployed to any static hosting
```

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to production
cd apps/web
vercel --prod
```

The Vercel dashboard will automatically detect the project and configure deployments.

### Manual Deployment

```bash
# Build the app
pnpm build --filter apps/web

# Upload the out/ directory to your hosting provider
# Example: rsync -avz out/ user@server:/var/www/html/
```

## Performance Optimization

- **Static Export**: All pages are pre-rendered for fast loading
- **Image Optimization**: Next.js Image component with automatic optimization
- **Code Splitting**: Routes are automatically code-split
- **Caching**: Configured via `vercel.json` for optimal CDN performance
- **Font Loading**: Google Fonts are preloaded

## Security

- **Environment Variables**: All secrets are managed via environment variables
- **Supabase RLS**: Row-Level Security is enabled for all tables
- **CORS**: Configured in `vercel.json`
- **CSP**: Content Security Policy is set in `vercel.json`
- **Rate Limiting**: API routes implement rate limiting

## Monitoring

- **Vercel Analytics**: Built-in analytics for traffic and performance
- **Sentry**: Error tracking and performance monitoring
- **Supabase Logs**: Database query logging

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Deployment Guide](https://vercel.com/docs/deployments/deployations)
- [Supabase Documentation](https://supabase.com/docs)
- [Zustand Documentation](https://zustand.docs.pmnd.rs/)
