# ChinaSuuq Mobile - Build Instructions

This document provides instructions for building and submitting the ChinaSuuq mobile app using Expo/EAS (Expo Application Services).

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Expo CLI installed globally: `npm install -g expo-cli`
- EAS CLI installed globally: `npm install -g eas-cli`
- Expo account registered at https://expo.dev

## Android Build

### Build APK (for direct distribution)

```bash
cd apps/mobile
eas build --platform android --profile production
```

The APK will be available for download from the EAS build output.

### Build AAB (for Google Play Store)

```bash
cd apps/mobile
eas build --platform android --profile production --clear-cache
```

The AAB (Android App Bundle) will be uploaded to the Google Play Console.

## iOS Build

### Build IPA (for TestFlight/App Store)

```bash
cd apps/mobile
eas build --platform ios --profile production
```

**Note:** iOS builds require:
- Apple Developer account ($99/year)
- Apple Distribution certificate installed
- Provisioning profile configured
- Mac with Xcode for signing (EAS Build handles this automatically)

### Build for TestFlight

```bash
cd apps/mobile
eas build --platform ios --profile production
eas submit --platform ios
```

## Submitting to Stores

### Google Play Store

1. Upload the AAB to Google Play Console
2. Fill in app details (store listing, privacy policy, etc.)
3. Set release tracks (internal, closed, open, production)
4. Review and publish

Required credentials:
- Google Play Console account
- Service account key (`google-service-account.json`) - configured in `eas.json`

### Apple App Store

1. Upload the IPA to App Store Connect
2. Fill in app details (metadata, screenshots, privacy policy)
3. Submit for App Review
4. Respond to any review feedback

Required credentials:
- Apple Developer account
- App Store Connect access
- Valid provisioning profiles

## Build Profiles

The project uses three EAS build profiles defined in `eas.json`:

| Profile | Description | Use Case |
|---------|-------------|----------|
| `development` | Development client | Local testing, CI debugging |
| `preview` | Internal distribution | Beta testing, internal review |
| `production` | Store submission | Production builds for app stores |

## Environment Variables

The following environment variables are configured in `eas.json`:

- `EXPO_PUBLIC_SUPABASE_URL`: Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key

## Verification Scripts

Before building, run the verification scripts to ensure code quality:

```bash
cd apps/mobile
npm run verify
```

This runs:
- TypeScript type check (`tsc --noEmit`)
- WebView runtime verification
- Translation client verification
- USD in-page verification
- In-batches verification
- Marketplace session verification
- Cart and states verification

## Troubleshooting

### Common Issues

1. **Build fails with certificate errors**: Ensure your Apple Developer certificates are up to date
2. **Play Store upload fails**: Check that your service account key has the correct permissions
3. **EAS build times out**: Increase build timeout or optimize app size

### Getting Build Logs

```bash
eas build:view --platform android --latest
eas build:view --platform ios --latest
```

## Version Management

- Update version in both `apps/mobile/package.json` and `apps/mobile/app.json`
- Version must match between both files
- EAS auto-increments build numbers for production builds
