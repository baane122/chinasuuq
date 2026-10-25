# ChinaSuuq Deployment Guide

Complete deployment procedures for the ChinaSuuq monorepo.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │     │    Web App      │     │   Supabase      │
│  (Expo/React    )────▶│  (Next.js      )────▶│  (PostgreSQL +  │
│    Native)      │     │   Static Export)│     │   Auth + Storage)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                ▼
                      ┌─────────────────┐
                      │    Vercel       │
                      │  (Web Hosting)  │
                      └─────────────────┘
```

## CI/CD Pipeline

### Web App (Vercel)

The web app uses Vercel for automatic deployments:

1. **Push to GitHub** → Vercel detects changes
2. **Install** → `npm ci` in `apps/web/`
3. **Build** → `npm run build` (static export with webpack)
4. **Test** → Runs verification scripts automatically
5. **Deploy** → Serves from `apps/web/out/`

**Pipeline Config** (`vercel.json`):
- Build command: `cd apps/web && npm run build`
- Output directory: `apps/web/out`
- Security headers configured
- CDN caching optimized

### Mobile App (EAS Build)

Mobile uses Expo Application Services (EAS) for builds:

1. **Push to GitHub** → Trigger EAS build (manual or automated)
2. **Build** → Cloud-based iOS/Android builds
3. **Test** → Internal distribution via TestFlight/Google Play
4. **Submit** → App Store / Google Play submission

## How to Deploy to Production

### Web App

#### Option 1: Automatic (GitHub Integration)

```bash
# 1. Ensure your code is on main branch
git checkout main
git push origin main

# 2. Vercel will automatically deploy
# Check status at: https://vercel.com/chinasuuq/dashboard
```

#### Option 2: Manual Deploy

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy to production
cd apps/web
vercel --prod
```

#### Option 3: Local Build + Upload

```bash
cd apps/web
npm run build
# Upload `out/` folder to your hosting provider
```

### Mobile App

#### Development Build

```bash
cd apps/mobile

# Build for Android (debug APK)
eas build --profile development --platform android

# Build for iOS (debug simulator)
eas build --profile development --platform ios
```

#### Preview Build (Internal Testing)

```bash
# Android APK
eas build --profile preview --platform android

# iOS IPA
eas build --profile preview --platform ios
```

#### Production Build

```bash
# Android App Bundle (for Google Play)
eas build --profile production --platform android

# iOS Archive (for App Store)
eas build --profile production --platform ios
```

#### Submit to Stores

```bash
# Submit Android to Google Play
eas submit --platform android

# Submit iOS to App Store
eas submit --platform ios
```

#### OTA Updates (No Store Review)

```bash
# Publish update to all installed apps
eas update --branch main

# Publish to specific branch
eas update --branch develop
```

## How to Rotate Secrets

### Supabase Keys

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `athkmrvsaijwgsyvwrbp`
3. Go to **Settings** → **API**
4. Click **Rotate Secret Key**
5. Update environment variables:
   - Web: `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
   - Mobile: `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### Vercel Environment Variables

1. Go to [Vercel Dashboard](https://vercel.com)
2. Select project → **Settings** → **Environment Variables**
3. Update values and redeploy

### EAS Project Credentials

1. Login to EAS: `eas login`
2. Update credentials in `eas.json`
3. Re-authenticate: `eas credentials --platform android` or `ios`

### Google Service Account (Android)

1. Download new service account JSON from Google Play Console
2. Place in `apps/mobile/google-service-account.json`
3. Update `eas.json` path if changed

## How to Do Mobile Builds

### Prerequisites

- EAS account: `eas login`
- Apple Developer account (iOS)
- Google Play Console account (Android)
- `google-service-account.json` for Android submissions

### Build Profiles (`eas.json`)

| Profile | Purpose | Output | Distribution |
|---------|---------|--------|--------------|
| `development` | Local testing | APK (Android), IPA (iOS simulator) | Internal |
| `preview` | QA testing | APK (Android), IPA (iOS device) | Internal |
| `production` | App stores | AAB (Android), IPA (iOS) | Store |

### Common Build Commands

```bash
cd apps/mobile

# Build for all platforms
eas build --profile production

# Build for specific platform
eas build --profile production --platform android
eas build --profile production --platform ios

# Build with local credentials
eas build --profile production --local

# Build and submit automatically
eas build --profile production --auto-submit
```

### Build Outputs

| Platform | Output Format | Store |
|----------|---------------|-------|
| Android | `.aab` (App Bundle) | Google Play |
| Android (debug) | `.apk` | Direct install |
| iOS | `.ipa` | App Store Connect |

## Rollback Procedures

### Web App Rollback

#### Via Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com)
2. Select project → **Deployments**
3. Find the deployment to rollback
4. Click **...** → **Promote to Production**

#### Via CLI

```bash
# List recent deployments
vercel ls

# Promote specific deployment
vercel promote <deployment-url>
```

### Mobile App Rollback

#### iOS (App Store)

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Select app → **Versions**
3. Roll back to previous approved version
4. Or submit new build with older code

#### Android (Google Play)

1. Go to [Google Play Console](https://play.google.com/console)
2. Select app → **Production**
3. Roll back to previous release
4. Or create new draft with older build

#### OTA Rollback (Expo Updates)

```bash
# Rollback to previous update
eas update --rollback

# Or publish specific commit
eas update --from-git-tag v1.0.0
```

## Emergency Procedures

### Database Incident

1. Restore from Supabase backup:
   - Dashboard → **Database** → **Backups**
   - Select timestamp and restore

### Service Outage

1. Check status: [status.supabase.com](https://status.supabase.com)
2. If Supabase down: wait for recovery
3. If Vercel down: check [status.vercel.com](https://status.vercel.com)

### Security Breach

1. Rotate all secrets immediately
2. Revoke compromised tokens
3. Review audit logs
4. Patch vulnerability
5. Redeploy with fixes

## Monitoring

### Web App

- **Vercel Analytics**: [vercel.com/analytics](https://vercel.com/analytics)
- **Sentry Errors**: [sentry.io](https://sentry.io)
- **Supabase Logs**: Dashboard → **Project Settings** → **Logs**

### Mobile App

- **Expo Notifications**: [expo.dev/notifications](https://expo.dev/notifications)
- **Crashlytics**: Integrated via react-native-logs
- **Supabase Logs**: Same as web app

## Contact & Support

- **Infrastructure**: Supabase + Vercel + Expo
- **Monitoring**: Sentry + Vercel Analytics
- **Support**: Internal team via Slack/Discord
