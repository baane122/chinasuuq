# ChinaSuuq Mobile - Production Checklist

Use this checklist before deploying to production.

## Security Checks

- [ ] **Environment Variables**: All secrets are in environment variables, not hardcoded
- [ ] **Supabase RLS**: Row-Level Security policies are enabled for all tables
- [ ] **API Keys**: No API keys committed to git (check `.gitignore`)
- [ ] **HTTPS**: All API endpoints use HTTPS
- [ ] **CORS**: CORS policies are restrictive
- [ ] **Auth**: Session tokens are securely stored (expo-secure-store)
- [ ] **Input Validation**: All user inputs are validated with Zod schemas
- [ ] **Rate Limiting**: API endpoints have rate limiting
- [ ] **Dependency Audit**: `npm audit` shows no critical vulnerabilities
- [ ] **Secrets Rotation**: All secrets are rotated regularly

## Performance Checks

- [ ] **Bundle Size**: JavaScript bundle is under 300KB
- [ ] **Image Optimization**: Images are compressed and using WebP format
- [ ] **Code Splitting**: Routes are lazy-loaded where possible
- [ ] **Caching**: Efficient caching strategies are implemented
- [ ] **Network Requests**: Minimal API calls, batching where possible
- [ ] **Memory Usage**: No memory leaks in long-running sessions
- [ ] **Startup Time**: App launches in under 3 seconds
- [ ] **Animation Performance**: Animations run at 60fps
- [ ] **Offline Support**: Critical features work offline
- [ ] **Cache Strategy**: App cache is cleared appropriately

## Accessibility Checks

- [ ] **Screen Readers**: All elements have accessible labels
- [ ] **Color Contrast**: Text meets WCAG AA contrast ratios
- [ ] **Touch Targets**: All interactive elements are at least 44x44 dp
- [ ] **Font Scaling**: Text scales appropriately with system settings
- [ ] **Keyboard Navigation**: App is navigable via keyboard (web)
- [ ] **Voice Over**: Tested with VoiceOver (iOS) and TalkBack (Android)
- [ ] **Language Support**: i18n is complete for all supported languages
- [ ] **Error Messages**: Clear and actionable error messages
- [ ] **Focus Indicators**: Visible focus states for all interactive elements
- [ ] **Dynamic Type**: Layout adapts to dynamic type sizes

## Error Tracking Setup

- [ ] **Sentry**: Integrated and configured
  - [ ] DSN is set in environment
  - [ ] Environment is set to `production`
  - [ ] Release version is configured
  - [ ] Source maps are uploaded
- [ ] **Logging**: Structured logging is implemented
- [ ] **Error Boundaries**: React error boundaries are in place
- [ ] **Unhandled Promises**: Promise rejections are caught and logged
- [ ] **Network Errors**: Network failures are handled gracefully
- [ ] **Crash Reporting**: Crash reports are sent to Sentry

## Monitoring Setup

- [ ] **Expo Updates**: OTA updates are configured
- [ ] **Analytics**: User analytics are tracked (optional)
- [ ] **Performance Monitoring**: App performance is monitored
- [ ] **Crash Alerts**: Team is notified of crashes
- [ ] **Uptime Monitoring**: App availability is monitored
- [ ] **Build Alerts**: Team is notified of build failures

## Backup Procedures

- [ ] **Database Backups**: Supabase automatic backups are enabled
- [ ] **Backup Testing**: Restores are tested periodically
- [ ] **Export Scripts**: Data export scripts are available
- [ ] **Point-in-Time Recovery**: PITR is configured
- [ ] **Backup Frequency**: Daily backups are scheduled
- [ ] **Retention Policy**: Backups are retained for 30 days

## App Store Requirements

### iOS
- [ ] **Privacy Manifest**: App privacy labels are complete
- [ ] **App Icons**: All required icon sizes are provided
- [ ] **Splash Screen**: Launch screen is configured
- [ ] **Bundle ID**: Matches App Store Connect
- [ ] **Signing**: Certificates and profiles are valid
- [ ] **TestFlight**: Beta testing is configured

### Android
- [ ] **Keystore**: Production keystore is secured
- [ ] **App Bundle**: AAB format is used
- [ ] **Package Name**: Matches Google Play Console
- [ ] **Permissions**: All permissions are documented
- [ ] **Target SDK**: Targets latest Android SDK
- [ ] **Google Play Console**: Developer account is active

## Pre-Launch Checklist

- [ ] **End-to-End Testing**: All user flows are tested
- [ ] **Device Testing**: Tested on multiple devices/OS versions
- [ ] **Network Testing**: Works on slow/unstable connections
- [ ] **Battery Impact**: App doesn't drain battery excessively
- [ ] **Storage Impact**: App doesn't consume excessive storage
- [ ] **Legal Compliance**: Terms of service and privacy policy are ready
- [ ] **Support Channels**: Customer support is available
- [ ] **Documentation**: User guides and FAQs are ready
- [ ] **Marketing Materials**: Screenshots and descriptions are prepared
- [ ] **Launch Plan**: Coordinated launch strategy is in place

## Post-Launch Monitoring

- [ ] **Crash Rate**: Monitor crash-free percentage (target: >99.5%)
- [ ] **Performance**: Monitor app startup and response times
- [ ] **User Feedback**: Collect and respond to user feedback
- [ ] **Analytics**: Track key metrics (DAU, retention, conversion)
- [ ] **Reviews**: Monitor app store reviews
- [ ] **Incident Response**: Have a plan for addressing issues

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| Developer | | | ☐ |
| QA | | | ☐ |
| Product | | | ☐ |
| Security | | | ☐ |
