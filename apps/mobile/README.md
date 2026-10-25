# ChinaSuuq Mobile

ChinaSuuq Mobile is a React Native/Expo application for the ChinaSuuq logistics platform, enabling users to track shipments, get quotes, and manage orders on the go.

## Tech Stack

- **Framework**: Expo SDK 57 (React Native 0.86)
- **Navigation**: Expo Router v5 + React Navigation v7
- **State Management**: Zustand v5
- **Database**: Supabase (PostgreSQL)
- **Styling**: React Native core + Tailwind-like utilities
- **Translation**: Custom i18n with expo-localization
- **Native Modules**: Secure Store, Haptics, Image, Linear Gradient, WebView, Camera/Screen capture

## Setup Instructions

### Prerequisites

- Node.js 22+
- npm or pnpm
- Expo CLI (`npm install -g eas-cli`)
- Expo account (for EAS builds)
- Apple Developer account (iOS builds) / Google Play Console (Android builds)

### Local Development

```bash
# Navigate to mobile app
cd apps/mobile

# Install dependencies
npm install

# Start development server
npm start

# Run on Android emulator
npm run android

# Run on iOS simulator
npm run ios

# Run on web (for testing)
npm run web
```

### Expo Go

1. Install Expo Go from [App Store](https://apps.apple.com/app/expo-go/id982107779) or [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
2. Scan the QR code from the terminal after running `npm start`
3. App will load on your device

## Environment Variables

Create a `.env` file in `apps/mobile/` with the following variables:

```env
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Optional: Development flags
EXPO_PUBLIC_DEV_BUILD=1
```

> **Note**: The app uses `app.config.js` to merge environment variables. For EAS builds, set these in the EAS dashboard or `eas.json`.

## Available Scripts

| Script | Description |
|--------|-------------|
| `start` | Start Expo development server |
| `android` | Build and run on Android device/emulator |
| `ios` | Build and run on iOS simulator |
| `web` | Start web development server |
| `tsc` | Type check without emitting |
| `verify` | Run all verification scripts (TypeScript + feature checks) |

### Verification Scripts

These scripts verify critical functionality before deployment:

```bash
# Run all verifications
npm run verify

# Individual verification scripts
npm run verify:webview      # Verify webview runtime
npm run verify:translate    # Verify translation client
npm run verify:translate-inpage  # Verify in-page translation
npm run verify:usd          # Verify USD conversion
npm run verify:inbatches    # Verify batch operations
npm run verify:session      # Verify marketplace session
npm run verify:states       # Verify cart and states
```

## Folder Structure

```
apps/mobile/
├── app/                    # Expo Router file-based routing
│   ├── (auth)/            # Authentication screens
│   ├── (tabs)/            # Main tab navigation
│   │   ├── index.tsx      # Home screen
│   │   ├── market.tsx     # Marketplace
│   │   ├── orders.tsx     # Orders list
│   │   ├── profile.tsx    # User profile
│   │   └── tracking.tsx   # Shipment tracking
│   └── +not-found.tsx     # 404 fallback
├── src/
│   ├── api/               # API client and service layer
│   ├── components/        # Reusable UI components
│   │   ├── ui/           # Base UI primitives
│   │   ├── home/         # Home screen components
│   │   ├── marketplace/  # Marketplace components
│   │   ├── product/      # Product detail components
│   │   ├── checkout/     # Checkout flow
│   │   ├── profile/      # Profile components
│   │   ├── cart/         # Shopping cart
│   │   ├── market/       # Market-specific components
│   │   ├── staff/        # Staff/admin features
│   │   ├── orders/       # Order management
│   │   └── animations/   # Lottie/animations
│   ├── config/            # App configuration
│   ├── db/                # Database helpers
│   ├── hooks/             # Custom React hooks
│   ├── i18n/              # Internationalization
│   ├── lib/               # Shared utilities and clients
│   ├── store/             # Zustand stores
│   └── types/             # TypeScript type definitions
├── assets/                # Images, fonts, and static files
│   ├── images/           # App icons and splash screen
│   └── fonts/            # Custom fonts
├── scripts/               # Build and verification scripts
├── app.json              # Expo configuration
├── app.config.js         # Dynamic config with env vars
├── eas.json              # EAS Build profiles
├── babel.config.js       # Babel configuration
├── metro.config.js       # Metro bundler config
└── tsconfig.json         # TypeScript configuration
```

## Deployment Guide

### Expo Go (Development)

```bash
npm start
```
Scan the QR code with Expo Go app.

### Development Build (Custom Client)

```bash
# Install development build on device
eas build --profile development --platform android
eas build --profile development --platform ios
```

### Preview Build (Internal Testing)

```bash
# Build for internal testing
eas build --profile preview --platform android
eas build --profile preview --platform ios
```

### Production Build (App Store / Play Store)

```bash
# Android (APK for testing)
eas build --profile production --platform android

# Android (AAB for Google Play)
eas build --profile production --platform android --auto-submit

# iOS (IPA for App Store)
eas build --profile production --platform ios --auto-submit
```

### Submit to Stores

```bash
# Submit Android to Google Play
eas submit --platform android

# Submit iOS to App Store Connect
eas submit --platform ios
```

### OTA Updates (Expo Updates)

```bash
# Publish update to existing installed apps
eas update --branch main

# Publish to specific branch
eas update --branch develop
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `expo start` fails | Run `npm install` and clear cache: `npx expo start --clear` |
| Build fails on iOS | Ensure Xcode command line tools are set: `xcode-select --parse-snapshot` |
| Android build fails | Check Java version: `java -version` (requires JDK 17+) |
| Supabase connection fails | Verify env vars are set correctly in `app.config.js` |
| Metro bundler port conflict | Kill existing process: `lsof -ti:8081 | xargs kill` |

### Clear Cache

```bash
# Clear Expo cache
npx expo start --clear

# Clear npm cache
npm cache clean --force
```

### Reset Project

```bash
# Remove node_modules and reinstall
rm -rf node_modules
npm install

# Remove build artifacts
rm -rf .expo dist android ios
```

## Additional Resources

- [Expo Documentation](https://docs.expo.dev/)
- [EAS Build Guide](https://docs.expo.dev/eas/build/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [Supabase React Native](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native)
- [Zustand](https://zustand.docs.pmnd.rs/)
