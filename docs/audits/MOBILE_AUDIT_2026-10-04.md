# ChinaSuuq Mobile — Deep Audit & Production Fix Plan

## Role-Based Access Matrix (Current → Target)

| Screen | Guest | Customer | Staff | Super Admin |
|--------|-------|----------|-------|-------------|
| Home / Browse | ✅ | ✅ | ✅ | ✅ |
| Markets (5 platforms) | ✅ | ✅ | ✅ | ✅ |
| Marketplace WebView | ✅ Public pages | ✅ With staff cookies | ✅ Full sync + AI scan | ✅ |
| Search | ✅ | ✅ | ✅ | ✅ |
| Product Detail | ✅ View only | ✅ Add to cart | ✅ Add to cart | ✅ Add to cart |
| Cart | ❌ Login required | ✅ | ✅ | ✅ |
| Checkout | ❌ Login required | ✅ | ✅ | ✅ |
| Orders | ❌ Login required | ✅ Own orders | ✅ All orders | ✅ |
| Wishlist | ❌ Login required | ✅ | ✅ | ✅ |
| Profile / Settings | ❌ Login required | ✅ | ✅ | ✅ |
| Staff Marketplaces | ❌ | ❌ | ✅ | ✅ |
| Staff Sync Cookies | ❌ | ❌ | ✅ Button in WebView | ✅ |
| AI Scan Product | ❌ | ❌ | ✅ Button in WebView | ✅ |
| Admin Web (Mission Control) | ❌ | ❌ | Via web admin | ✅ |

## Issues Found (Ranked)

### P0 — CRASHING / BLOCKING
1. **`@react-native-cookies` Invariant Violation** — already fixed (v1.0.3)
2. **Staff role not checked on protected screens** — guest can navigate to cart/checkout/orders without login barrier
3. **WebView "sync session" crashes on Expo Go** — partially fixed but needs deeper guard

### P1 — FUNCTIONAL GAPS
4. **No login wall on cart/checkout** — users can reach these screens without being authenticated
5. **Login/signup UI is plain/basic** — doesn't match brand polish expectations
6. **Product detail: no "auto-from-buy" flow** — customer must manually select variants, qty, then add to cart
7. **Marketplace WebView: no auto-sync on staff login** — staff must manually tap "sync"
8. **AI translation: 700ms interval good but no offline cache hit rate optimization**
9. **USD overlay: 900ms interval re-runs on every nav, no dedup**

### P2 — PERFORMANCE / UX
10. **ProductCard re-renders on every scroll frame** — memoized but not `React.memo`-optimal (uses inline `onPress`)
11. **Marketplace home page: no lazy image loading for product thumbnails in DOM**
12. **Auth store: `loadSession` doesn't handle GoTrue network recovery gracefully**
13. **No loading skeleton for product detail images**
14. **Staff banner text "Staff Account Detected" leaks internal jargon**
15. **Onboarding: no skip button visible at right spot**

### P3 — DESIGN / BRANDING
16. **Login screen: no brand gradient/orb animation, just plain form**
17. **Signup: bare-bones, no trust signals**
18. **Account tab: no staff badge, no quick actions**
19. **Product detail: no Instagram-style image zoom, no sticky price bar**

## Fixes Applied / In Progress
- [x] Fix cookie require crash (dynamic import)
- [x] Bump version to v1.0.3
- [ ] Add login guards on cart/checkout/orders
- [ ] Redesign login/signup with brand polish
- [ ] Add auto-sync for staff on marketplace entry
- [ ] Redesign product detail with premium feel
- [ ] Polish account tab
- [ ] EAS Android build
- [ ] Deploy to production
