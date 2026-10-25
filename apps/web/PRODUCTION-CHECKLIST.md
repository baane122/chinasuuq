# ChinaSuuq Web - Production Checklist

Use this checklist before deploying to production.

## Security Checks

- [ ] **Environment Variables**: All secrets are in environment variables, not hardcoded
- [ ] **Supabase RLS**: Row-Level Security policies are enabled for all tables
- [ ] **API Keys**: No API keys committed to git (check `.gitignore`)
- [ ] **HTTPS**: All endpoints use HTTPS (enforced by Vercel)
- [ ] **CORS**: CORS policies are restrictive
- [ ] **Auth**: Session management is secure
- [ ] **Input Validation**: All user inputs are validated with Zod schemas
- [ ] **Rate Limiting**: API endpoints have rate limiting
- [ ] **CSP**: Content Security Policy is configured in `vercel.json`
- [ ] **Dependency Audit**: `npm audit` shows no critical vulnerabilities
- [ ] **Secrets Rotation**: All secrets are rotated regularly
- [ ] **Admin Access**: Admin routes are protected and logged
- [ ] **Service Role Key**: Never exposed to client-side code
- [ ] **Edge Functions**: Secure and validated

## Performance Checks

- [ ] **Bundle Size**: JavaScript bundles are optimized
- [ ] **Image Optimization**: Using Next.js Image component
- [ ] **Code Splitting**: Routes are lazy-loaded
- [ ] **Caching**: Proper cache headers in `vercel.json`
- [ ] **CDN**: Vercel Edge Network is utilized
- [ ] **Database Queries**: Optimized with proper indexing
- [ ] **Static Export**: All pages are statically generated where possible
- [ ] **ISR**: Incremental Static Regeneration for dynamic content
- [ ] **Font Loading**: Fonts are preloaded
- [ ] **LCP**: Largest Contentful Paint < 2.5s

## Accessibility Checks

- [ ] **Semantic HTML**: Proper heading hierarchy and ARIA labels
- [ ] **Color Contrast**: Text meets WCAG AA contrast ratios
- [ ] **Keyboard Navigation**: All features accessible via keyboard
- [ ] **Screen Readers**: Tested with VoiceOver and NVDA
- [ ] **Focus Indicators**: Visible focus states
- [ ] **Alternative Text**: All images have alt text
- [ ] **Form Labels**: All forms have proper labels
- [ ] **Error Messages**: Clear and actionable
- [ ] **Language**: `lang` attribute is set
- [ ] **Testing**: Tested with accessibility scanners

## Error Tracking Setup

- [ ] **Sentry**: Integrated and configured
  - [ ] DSN is set in environment
  - [ ] Environment is set to `production`
  - [ ] Release version is configured
  - [ ] Source maps are uploaded
- [ ] **Logging**: Structured logging is implemented
- [ ] **Error Boundaries**: React error boundaries are in place
- [ ] **Unhandled Promises**: Promise rejections are caught
- [ ] **Network Errors**: Network failures are handled
- [ ] **404 Handling**: Custom 404 page is implemented
- [ ] **500 Handling**: Custom error page is implemented

## Monitoring Setup

- [ ] **Vercel Analytics**: Enabled and configured
- [ ] **Web Vitals**: Monitoring Core Web Vitals
- [ ] **Uptime Monitoring**: External monitoring is set up
- [ ] **Build Alerts**: Team is notified of build failures
- [ ] **Error Alerts**: Critical errors trigger alerts
- [ ] **Performance Alerts**: Slow pages trigger alerts

## Backup Procedures

- [ ] **Database Backups**: Supabase automatic backups are enabled
- [ ] **Backup Testing**: Restores are tested periodically
- [ ] **Export Scripts**: Data export scripts are available
- [ ] **Point-in-Time Recovery**: PITR is configured
- [ ] **Backup Frequency**: Daily backups are scheduled
- [ ] **Retention Policy**: Backups are retained for 30 days
- [ ] **Static Assets**: CDN cache is manageable

## Vercel Configuration

- [ ] **Environment Variables**: All vars are set in Vercel Dashboard
- [ ] **Build Command**: Correct in `vercel.json`
- [ ] **Output Directory**: Correct in `vercel.json`
- [ ] **Regions**: Deployed to appropriate regions
- [ ] **Custom Domain**: Configured and SSL enabled
- [ ] **Redirects**: All redirects are working
- [ ] **Headers**: Security headers are properly configured
- [ ] **Git Integration**: Connected to repository

## Admin Access

- [ ] **Authentication**: Admin login requires valid credentials
- [ ] **Authorization**: Role-based access control is enforced
- [ ] **Session Management**: Sessions expire appropriately
- [ ] **Audit Logs**: Admin actions are logged
- [ ] **IP Restrictions**: Consider IP-based restrictions
- [ ] **2FA**: Two-factor authentication is enabled
- [ ] **Password Policy**: Strong password requirements

## Pre-Launch Checklist

- [ ] **End-to-End Testing**: All user flows are tested
- [ ] **Cross-Browser**: Tested on Chrome, Firefox, Safari, Edge
- [ ] **Mobile**: Responsive design works on all devices
- [ ] **Network Testing**: Works on slow connections
- [ ] **SEO**: Meta tags, sitemap, and robots.txt are configured
- [ ] **Legal**: Terms of service and privacy policy are ready
- [ ] **Support**: Customer support channels are available
- [ ] **Documentation**: User guides and FAQs are ready
- [ ] **Marketing**: Landing pages and materials are prepared
- [ ] **Launch Plan**: Coordinated launch strategy is in place

## Post-Launch Monitoring

- [ ] **Error Rate**: Monitor error rates (< 0.1%)
- [ ] **Performance**: Monitor page load times
- [ ] **User Feedback**: Collect and respond to feedback
- [ ] **Analytics**: Track key metrics (traffic, conversion, retention)
- [ ] **Reviews**: Monitor app store and web reviews
- [ ] **Incident Response**: Have a plan for addressing issues

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| Developer | | | ☐ |
| QA | | | ☐ |
| Product | | | ☐ |
| Security | | | ☐ |
