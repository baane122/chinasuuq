# ChinaSuuq — Complete Platform Documentation

> **Version**: 2.0 (Expo SDK 57 + Next.js 16)
> **Last Updated**: July 2025
> **Repository**: `github.com/baane122/chinasuuq`
> **Live**: https://chinasuuq.com
> **Admin**: https://chinasuuq.com/admin
> **Supabase**: `athkmrvsaijwgsyvwrbp.supabase.co`

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Brand Identity & Design System](#2-brand-identity--design-system)
3. [Architecture Overview](#3-architecture-overview)
4. [Monorepo Structure](#4-monorepo-structure)
5. [Supabase Backend](#5-supabase-backend)
6. [Landing Page (Web)](#6-landing-page-web)
7. [Admin Mission Control](#7-admin-mission-control)
8. [Mobile App (Expo/React Native)](#8-mobile-app-exporreact-native)
9. [Data Flow & How Screens Connect](#9-data-flow--how-screens-connect)
10. [Deployment & CI/CD](#10-deployment--cicd)

---

## 1. Platform Overview

ChinaSuuq is a **China-to-Somalia product marketplace** that connects Somali buyers with Chinese suppliers across 1688, Taobao, YiwuGo, and other platforms. The platform handles the entire lifecycle: product discovery → ordering → sourcing/purchasing → warehouse inspection → international shipping (air or sea) → delivery to Somali cities.

### Core Capabilities
- **Product browsing** from 6 Chinese marketplaces (50M+ products)
- **Smart MOQ** (Minimum Order Quantity) with suggested quick-buy buttons
- **Real-time CNY↔USD exchange rate** (Open-ER API, 6h cache)
- **International shipping calculator** (Air $8.50/kg, Sea $2.20/kg)
- **15-stage order tracking** pipeline
- **Bilingual support** (English + Somali)
- **WhatsApp integration** for customer support (+86 152 7707 4143)
- **Multiple payment methods**: ZAAD, Edahab, EVC Plus, Premier Wallet, Sahal, Bank Transfer

### User Roles
| Role | Access | Platform |
|------|--------|----------|
| **Guest** | Browse products, view prices | Mobile |
| **Customer** | Browse, order, track, pay | Mobile |
| **Admin** | Full CRUD, dashboard, analytics | Web |
| **Staff** | Limited admin operations | Web |

---

## 2. Brand Identity & Design System

### Brand Colors

| Token | Hex | Usage |
|-------|-----|-------|
| **Primary** | `#FF5A0A` | CTAs, links, active states, badges |
| **Primary Light** | `#FB923C` | Hover states, gradients |
| **Primary Dark** | `#E84400` | Pressed states |
| **Black** | `#111111` | Headings, body text |
| **Dark Surface** | `#191919` | Tab bar, footer backgrounds |
| **White** | `#FFFFFF` | Cards, backgrounds |
| **Warm White** | `#FFFCF8` | Page backgrounds |
| **Soft Orange** | `#FFF3E9` | Info cards, accent backgrounds |
| **Border** | `#E9E5E1` | Dividers, card borders |
| **Success** | `#12B76A` | Positive statuses, confirmations |
| **Warning** | `#F79009` | Pending states, alerts |
| **Error** | `#D92D20` | Destructive actions, errors |
| **Info** | `#2970FF` | Informational badges |
| **WhatsApp** | `#25D366` | WhatsApp CTA button |

### Typography

| Family | Weight | Usage |
|--------|--------|-------|
| **Inter** | Regular (400) | Body text |
| **Inter** | Medium (500) | Labels, captions |
| **Inter** | SemiBold (600) | Subheadings, buttons |
| **Inter** | Bold (700) | Headings, emphasis |

### Spacing Scale

| Token | Value |
|-------|-------|
| `xs` | 4px |
| `sm` | 8px |
| `md` | 12px |
| `lg` | 16px |
| `xl` | 20px |
| `xxl` | 24px |
| `xxxl` | 32px |

### Border Radius

| Token | Value |
|-------|-------|
| `sm` | 8px |
| `md` | 12px |
| `lg` | 16px |
| `xl` | 20px |
| `xxl` | 24px |
| `pill` | 999px |

### UI Component Patterns

**Cards**: `bg-white rounded-2xl border border-dark-900/5` (web) or `backgroundColor: COLORS.white, borderRadius: RADIUS.lg` (mobile)

**Buttons**: `bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold` (web) or `backgroundColor: COLORS.primary, borderRadius: RADIUS.md` (mobile)

**Inputs**: `border border-dark-900/10 rounded-xl px-3 py-2 text-sm focus:border-brand-500` (web)

**Badges**: `rounded-full px-2 py-0.5 text-[11px] font-bold uppercase` with color variants for status

**Modals**: Framer Motion slide-in from right (web), card presentation (mobile)

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Supabase                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ products │ │  orders  │ │profiles  │ │admin_*_views │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘   │
│       │             │            │               │           │
│  ┌────┴─────────────┴────────────┴───────────────┴───────┐  │
│  │              Row Level Security (RLS)                  │  │
│  └────────────────────────┬──────────────────────────────┘  │
└───────────────────────────┼──────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
    ┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │  Web (Next)  │ │  Mobile     │ │  Admin      │
    │  Landing     │ │  (Expo)     │ │  (Next.js)  │
    │  chinasuuq.  │ │  Expo Go /  │ │  /admin     │
    │  com         │ │  APK/iOS    │ │  Mission    │
    └──────────────┘ └─────────────┘ │  Control    │
                                     └─────────────┘
```

### Communication Flow
1. **Mobile ↔ Supabase**: Direct via `@supabase/supabase-js` with local-first fallback to AsyncStorage
2. **Web Landing ↔ Supabase**: Direct via `@supabase/supabase-js`
3. **Admin ↔ Supabase**: Direct via `@supabase/supabase-js` + `admin_*_view` projections
4. **Customer ↔ Admin**: Through Supabase (orders, payments, sourcing requests)
5. **Customer ↔ Support**: WhatsApp (+86 152 7707 4143)

---

## 4. Monorepo Structure

```
chinasuuq/
├── apps/
│   ├── web/                    # Next.js 16 web app
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (public)/   # Landing pages
│   │   │   │   │   ├── page.tsx           # Homepage
│   │   │   │   │   ├── about/page.tsx     # About
│   │   │   │   │   ├── business/page.tsx  # Business
│   │   │   │   │   ├── help/page.tsx      # Help
│   │   │   │   │   ├── how-it-works/page.tsx
│   │   │   │   │   ├── shipping/page.tsx  # Shipping info
│   │   │   │   │   └── track/page.tsx     # Order tracking
│   │   │   │   ├── admin/
│   │   │   │   │   ├── login/page.tsx     # Admin login
│   │   │   │   │   └── (protected)/       # Protected admin
│   │   │   │   │       ├── layout.tsx     # Sidebar + nav
│   │   │   │   │       ├── page.tsx       # Dashboard
│   │   │   │   │       ├── products/
│   │   │   │   │       ├── orders/
│   │   │   │   │       ├── customers/
│   │   │   │   │       ├── payments/
│   │   │   │   │       ├── shipments/
│   │   │   │   │       ├── sourcing/
│   │   │   │   │       ├── marketplaces/
│   │   │   │   │       ├── quotes/
│   │   │   │   │       ├── rates/
│   │   │   │   │       ├── warehouse/
│   │   │   │   │       ├── staff/
│   │   │   │   │       └── settings/
│   │   │   │   └── layout.tsx             # Root layout
│   │   │   ├── components/
│   │   │   │   ├── landing/               # Hero, Header, Footer, etc.
│   │   │   │   ├── admin/                 # KPICard, Modal, etc.
│   │   │   │   └── ui/                    # Button, Card, etc.
│   │   │   ├── lib/
│   │   │   │   ├── supabase.ts            # Supabase client
│   │   │   │   ├── admin/                 # Data layer, types
│   │   │   │   └── i18n.tsx               # React Context i18n
│   │   │   └── store/                     # Zustand stores
│   │   └── public/                        # Static assets
│   │
│   └── mobile/                 # Expo SDK 57 React Native app
│       ├── app/
│       │   ├── _layout.tsx                # Root Stack
│       │   ├── index.tsx                  # Entry redirect
│       │   ├── onboarding.tsx             # Onboarding flow
│       │   ├── (tabs)/                    # Bottom tab navigator
│       │   │   ├── _layout.tsx            # Tab bar config
│       │   │   ├── home.tsx               # Home feed
│       │   │   ├── markets.tsx            # Marketplace browser
│       │   │   ├── orders.tsx             # Order list
│       │   │   └── account.tsx            # Profile & settings
│       │   ├── (auth)/                    # Auth screens
│       │   │   ├── login.tsx
│       │   │   ├── signup.tsx
│       │   │   └── forgot-password.tsx
│       │   ├── product/[id].tsx           # Product detail
│       │   ├── marketplace/[marketplace].tsx # Marketplace browser
│       │   ├── cart/
│       │   │   ├── index.tsx              # Cart view
│       │   │   └── checkout.tsx           # Checkout flow
│       │   ├── orders/
│       │   │   ├── [id].tsx               # Order detail
│       │   │   ├── tracking.tsx           # Tracking view
│       │   │   └── success.tsx            # Order confirmation
│       │   ├── profile/                   # Profile subscreens
│       │   │   ├── personal-info.tsx
│       │   │   ├── addresses.tsx
│       │   │   ├── add-address.tsx
│       │   │   ├── payment-methods.tsx
│       │   │   ├── order-history.tsx
│       │   │   ├── wishlist.tsx
│       │   │   ├── referral.tsx
│       │   │   ├── help.tsx
│       │   │   ├── about.tsx
│       │   │   ├── terms.tsx
│       │   │   ├── privacy.tsx
│       │   │   ├── returns.tsx
│       │   │   └── shipping-info.tsx
│       │   ├── settings/index.tsx         # Settings (profile, language, shipping)
│       │   ├── notifications/
│       │   │   ├── index.tsx              # Notification list
│       │   │   └── settings.tsx           # Notification preferences
│       │   ├── support/index.tsx          # FAQ & support
│       │   └── search/index.tsx           # Search
│       ├── src/
│       │   ├── components/                # Reusable components
│       │   │   ├── home/                  # HeroBanner, ProductCard, etc.
│       │   │   ├── cart/                  # CartItem, FloatingCartButton
│       │   │   ├── orders/                # OrderCard, Timeline, etc.
│       │   │   ├── product/               # ImageCarousel, QuantitySelector
│       │   │   ├── profile/               # ProfileCard, MenuItem
│       │   │   ├── checkout/              # PaymentMethodCard
│       │   │   └── ui/                    # Button, Badge, Card, etc.
│       │   ├── lib/
│       │   │   ├── theme.ts               # Design tokens
│       │   │   ├── constants.ts           # Colors, categories, etc.
│       │   │   ├── i18n.tsx               # Global I18nContext
│       │   │   ├── shipping.ts            # Shipping calculator
│       │   │   ├── exchange.ts            # CNY↔USD rate
│       │   │   ├── supabase.ts            # Supabase client
│       │   │   └── supabase-adapter.ts    # Status mapping
│       │   ├── store/
│       │   │   ├── cart.ts                # Zustand cart store
│       │   │   └── auth.ts                # Zustand auth store
│       │   ├── db/
│       │   │   └── index.ts               # Local-first data layer
│       │   └── types/
│       │       └── index.ts               # TypeScript interfaces
│       └── assets/                        # Images, fonts
│
├── packages/                   # Shared packages (future)
├── turbo.json                  # Turborepo config
├── vercel.json                 # Vercel deployment config
└── package.json                # Root workspace
```

---

## 5. Supabase Backend

### Connection
- **URL**: `https://athkmrvsaijwgsyvwrbp.supabase.co`
- **Anon Key**: Used for both mobile and web (RLS-protected)
- **Service Role Key**: Admin operations only (server-side)

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User profiles | `id`, `full_name`, `email`, `phone`, `city`, `customer_type`, `tier` |
| `orders` | Customer orders | `id`, `customer_id`, `status`, `total_usd`, `shipping_method`, `payment_status` |
| `order_items` | Order line items | `id`, `order_id`, `product_id`, `quantity`, `unit_price_usd` |
| `source_products` | Product catalog | `id`, `marketplace`, `title_english`, `title_somali`, `images`, `price_cny_min`, `price_usd_estimated` |
| `payments` | Payment records | `id`, `order_id`, `method`, `amount_usd`, `status`, `reference_code` |
| `shipments` | Shipment tracking | `id`, `order_id`, `mode`, `status`, `carrier`, `tracking_no`, `eta` |
| `sourcing_requests` | Customer sourcing | `id`, `customer_id`, `source_url`, `status`, `priority` |
| `quotes` | Price quotes | `id`, `customer_id`, `total_usd`, `status`, `valid_until` |
| `addresses` | Delivery addresses | `id`, `user_id`, `label`, `street`, `city`, `is_default` |
| `favorites` | Wishlist items | `id`, `user_id`, `product_id` |
| `notifications` | Push notifications | `id`, `user_id`, `title`, `body`, `read` |
| `customer_notes` | Admin notes | `id`, `customer_id`, `note`, `created_by` |
| `exchange_rates` | Cached rates | `pair`, `buy`, `sell`, `source`, `updated_at` |

### Admin Views (Projections)

| View | Purpose |
|------|---------|
| `admin_orders_view` | Orders with customer name, total, status |
| `admin_customers_view` | Customers with aggregated order/spend stats |
| `admin_sourcing_view` | Sourcing requests with customer info |
| `admin_payments_view` | Payments with order/customer context |
| `admin_shipments_view` | Shipments with route and status |

### Row Level Security (RLS)

- **Anonymous users**: Read-only access to `source_products`, `categories`
- **Authenticated users**: Full access to own orders, addresses, favorites, profile
- **Admin role**: Full access to all tables + admin views
- **RLS policies** enforce data isolation between customers

### Status Mapping (Mobile ↔ DB)

The mobile app uses a simplified 16-stage status pipeline, while the database uses a more granular set. The `supabase-adapter.ts` handles bidirectional mapping:

```
Mobile Status          →  DB Status
─────────────────────────────────────
pending                →  pending
confirmed              →  confirmed
purchasing             →  sourcing
purchased              →  sourced / quoted
in_transit_china       →  in_warehouse
warehouse              →  in_warehouse
inspection             →  inspection_passed
consolidated           →  consolidated
shipped                →  shipped
in_transit             →  in_transit
arrived_somalia        →  in_transit
customs                →  customs_hold
ready_for_pickup       →  out_for_delivery
out_for_delivery       →  out_for_delivery
delivered              →  delivered
cancelled              →  cancelled
```

---

## 6. Landing Page (Web)

**URL**: https://chinasuuq.com
**Tech**: Next.js 16, Tailwind 4, Framer Motion, React 19

### Pages

| Page | Route | Purpose |
|------|-------|---------|
| **Homepage** | `/` | Hero, search, marketplace cards, how-it-works, trust bar, app download CTA |
| **About** | `/about` | Company story, mission, team, values |
| **Business** | `/business` | B2B sourcing, bulk orders, corporate accounts |
| **How It Works** | `/how-it-works` | Step-by-step process (Search → Source → Ship → Deliver) |
| **Shipping** | `/shipping` | Air vs sea comparison, rates, delivery cities |
| **Help** | `/help` | FAQ, contact info, WhatsApp link |
| **Track** | `/track` | Order tracking by reference number |

### Homepage Sections

1. **Hero** — Animated headline, search bar, marketplace platform chips (1688, Taobao, YiwuGo, Alibaba, ChinaGoods, JD), trust indicators, stats counter (50M+ products, 6 platforms, 7-30 days, 24/7 support)
2. **Search Bar** — Paste a Chinese product URL or search by keyword
3. **Marketplace Cards** — Visual cards for each sourcing platform with brand colors
4. **How It Works** — 3-step process with icons (Search → We Source & Inspect → Ships to Somalia)
5. **Trust Bar** — Secure payments, warehouse inspection, air & sea cargo, local support
6. **App Download** — QR code + links to Android APK and iOS TestFlight
7. **Footer** — Company links, contact (WhatsApp, email, phone), social media, legal

### Components

| Component | File | Description |
|-----------|------|-------------|
| `Header` | `components/landing/Header.tsx` | Fixed nav with scroll effect, mobile menu, language toggle |
| `Hero` | `components/landing/Hero.tsx` | Animated hero with count-up stats, marketplace chips |
| `SearchBar` | `components/landing/SearchBar.tsx` | URL/keyword search input |
| `HowItWorks` | `components/landing/HowItWorks.tsx` | 3-step process visualization |
| `TrustBar` | `components/landing/TrustBar.tsx` | Trust indicators with icons |
| `AppDownload` | `components/landing/AppDownload.tsx` | Download CTA with QR code |
| `WhatsAppFAB` | `components/landing/WhatsAppFAB.tsx` | Floating WhatsApp button |
| `Footer` | `components/landing/Footer.tsx` | Full footer with links and contact |

### Header Navigation
- Home (`/`)
- How It Works (`/how-it-works`)
- Shipping (`/shipping`)
- About (`/about`)
- Language toggle (EN/SO)
- Download App button
- Login button (admin)

---

## 7. Admin Mission Control

**URL**: https://chinasuuq.com/admin
**Tech**: Next.js 16, Tailwind 4, Framer Motion, Zustand, Supabase

### Authentication
- Email/password login via Supabase Auth
- Session stored in cookies (`chinasuuq-admin-session`)
- Protected by `admin/(protected)/layout.tsx` middleware
- Role-based access: `super_admin`, `admin`, `ops`, `finance`, `support`, `warehouse`

### Sidebar Navigation (13 sections)

| Section | Route | Icon | Description |
|---------|-------|------|-------------|
| Dashboard | `/admin` | LayoutDashboard | KPIs, charts, activity feed |
| Customers | `/admin/customers` | Users | Customer profiles, order history |
| Products | `/admin/products` | Package | Product catalog CRUD |
| Orders | `/admin/orders` | ShoppingBag | Order management, status workflow |
| Marketplaces | `/admin/marketplaces` | Globe | Marketplace account management |
| Payments | `/admin/payments` | CreditCard | Payment tracking, reconciliation |
| Exchange Rates | `/admin/rates` | BarChart3 | CNY/USD rate management |
| Sourcing | `/admin/sourcing` | ClipboardList | Customer sourcing requests |
| Quotes | `/admin/quotes` | BadgeDollarSign | Price quotes management |
| Shipments | `/admin/shipments` | Ship | Shipment tracking, ETA |
| Warehouse | `/admin/warehouse` | Boxes | Inventory, inspection, consolidation |
| Staff & Roles | `/admin/staff` | UserCog | Team management |
| Settings | `/admin/settings` | Settings | Platform configuration |

### Dashboard (`page.tsx` — 972 lines)

**KPI Cards** (animated counters):
- Total Revenue (USD)
- Active Orders
- Total Customers
- Active Shipments

**Charts** (pure CSS/SVG):
- Revenue Bar Chart (last 7 days)
- Order Status Donut (pipeline distribution)

**Tables**:
- Recent Orders (Order #, Customer, City, Total, Status, Payment, Date)
- Top Selling Products (ranked list with marketplace, price, sales count)

**Panels**:
- Revenue Breakdown by Marketplace (1688, Taobao, YiwuGo with progress bars)
- Live Activity Feed (real-time events with type-specific icons)
- Quick Actions (New Order, Export, Settings)

### Shared Admin Components

| Component | File | Description |
|-----------|------|-------------|
| `KPICard` | `components/admin/KPICard.tsx` | Animated counter card with icon |
| `DataTable` | `components/admin/DataTable.tsx` | Sortable table with pagination |
| `StatusBadge` | `components/admin/StatusBadge.tsx` | Color-coded status pill |
| `Modal` | `components/admin/Modal.tsx` | Slide-in modal with Framer Motion |
| `ConfirmDialog` | `components/admin/ConfirmDialog.tsx` | Delete confirmation |
| `Toast` | `components/admin/Toast.tsx` | Success/error notifications |
| `FormInput` | `components/admin/FormInput.tsx` | Styled form field |

### CRUD Pages Summary

| Page | Lines | Features |
|------|-------|----------|
| **Products** | 1,139 | Full CRUD, image preview, bulk actions, search/filter, CSV export, KPI stats |
| **Orders** | 722 | 15-stage workflow, progress bars, timeline, detail drawer, bulk update, print invoice |
| **Customers** | 636 | Search, type/VIP filter, sortable columns, order history, admin notes, CSV export |
| **Payments** | 568 | ZAAD/eDahab/EVC tracking, reconciliation mode, revenue by method, CSV export |
| **Shipments** | 531 | Air/sea/land breakdown, ETA countdown, status timeline, detail drawer |
| **Sourcing** | 435 | Price comparison, quote management, status workflow, mobile captures link |
| **Marketplaces** | 480 | Account management, credential storage, usage stats |
| **Quotes** | 490 | Quote creation, status workflow, PDF export |
| **Rates** | 364 | Exchange rate management, source tracking |
| **Warehouse** | 591 | Inventory tracking, inspection queue, consolidation |
| **Staff** | 496 | Role management, permissions, activity log |
| **Settings** | 458 | Platform config, notifications, integrations |

---

## 8. Mobile App (Expo/React Native)

**Tech**: Expo SDK 57, React Native 0.86, React 19.2, TypeScript 6, Zustand, expo-router

### Build Profiles

| Profile | Platform | Purpose |
|---------|----------|---------|
| `development` | Android/iOS | Local dev with Expo Go |
| `preview` | Android APK | Testing on physical devices |
| `production` | Android AAB + iOS | App Store / Play Store |

### EAS Build
- **Project**: `@baaaane24/chinasuuq-mobile`
- **Owner**: `baaaane24`
- **Project ID**: `a8484922-0c4f-4f79-b4be-f93fe1dd5747`

### Tab Structure (4 tabs)

| Tab | Icon | Route | Purpose |
|-----|------|-------|---------|
| **Home** | Home | `/(tabs)/home` | Product feed, hero banner, categories |
| **Markets** | Store | `/(tabs)/markets` | Marketplace browser (1688, Taobao, etc.) |
| **Orders** | ShoppingBag | `/(tabs)/orders` | Order list with cart badge |
| **Account** | User | `/(tabs)/account` | Profile, settings, all subscreens |

### All Mobile Screens (38 screens)

#### Tab Screens
| Screen | Path | Description |
|--------|------|-------------|
| Home | `(tabs)/home.tsx` | Hero banner, category chips, product cards, WhatsApp CTA |
| Markets | `(tabs)/markets.tsx` | Marketplace grid with brand colors |
| Orders | `(tabs)/orders.tsx` | Active orders, order history |
| Account | `(tabs)/account.tsx` | Profile card, menu items, stats |

#### Auth Screens
| Screen | Path | Description |
|--------|------|-------------|
| Login | `(auth)/login.tsx` | Email/password login |
| Signup | `(auth)/signup.tsx` | Registration form |
| Forgot Password | `(auth)/forgot-password.tsx` | Password reset |

#### Product & Marketplace
| Screen | Path | Description |
|--------|------|-------------|
| Product Detail | `product/[id].tsx` | Images, variants, smart MOQ, shipping calc |
| Marketplace Browser | `marketplace/[marketplace].tsx` | WebView-based browsing |

#### Cart & Checkout
| Screen | Path | Description |
|--------|------|-------------|
| Cart | `cart/index.tsx` | Cart items, quantity adjust, totals |
| Checkout | `cart/checkout.tsx` | Address, payment, shipping method |

#### Orders
| Screen | Path | Description |
|--------|------|-------------|
| Order Detail | `orders/[id].tsx` | Status timeline, tracking events |
| Order Tracking | `orders/tracking.tsx` | Real-time tracking view |
| Order Success | `orders/success.tsx` | Confirmation with reference |

#### Profile Subscreens
| Screen | Path | Description |
|--------|------|-------------|
| Personal Info | `profile/personal-info.tsx` | Name, phone, email edit |
| Addresses | `profile/addresses.tsx` | Saved delivery addresses |
| Add Address | `profile/add-address.tsx` | New address form (modal) |
| Payment Methods | `profile/payment-methods.tsx` | ZAAD, Edahab, EVC, etc. |
| Order History | `profile/order-history.tsx` | Past orders list |
| Wishlist | `profile/wishlist.tsx` | Saved products |
| Referral | `profile/referral.tsx` | Referral code & sharing |
| Help | `profile/help.tsx` | FAQ accordion, contact info |
| About | `profile/about.tsx` | Brand card, features, legal links |
| Terms | `profile/terms.tsx` | Terms of Service (EN/SO) |
| Privacy | `profile/privacy.tsx` | Privacy Policy (EN/SO) |
| Returns | `profile/returns.tsx` | Returns policy, step-by-step guide |
| Shipping Info | `profile/shipping-info.tsx` | Air vs sea comparison, delivery cities |

#### Settings & Notifications
| Screen | Path | Description |
|--------|------|-------------|
| Settings | `settings/index.tsx` | Profile edit, language, shipping pref, backend status |
| Notifications | `notifications/index.tsx` | Notification list |
| Notification Settings | `notifications/settings.tsx` | Toggle preferences (AsyncStorage) |

#### Support & Search
| Screen | Path | Description |
|--------|------|-------------|
| Support/FAQ | `support/index.tsx` | Bilingual FAQ (EN/SO) |
| Search | `search/index.tsx` | Product search |

### Mobile State Management

**Zustand Stores**:
- `cart.ts` — Cart items, add/remove/update, totals, marketplace count
- `auth.ts` — User session, sign in/up/out, profile refresh

**Local-First Data Layer** (`db/index.ts`):
- Every read/write goes through this layer
- Tries Supabase first → falls back to AsyncStorage if offline
- Syncs back to Supabase when online
- Functions: `listOrders()`, `createOrder()`, `updateOrderStatus()`, `listAddresses()`, `createAddress()`, `listFavorites()`, `addFavorite()`, `updateProfile()`, `isBackendOnline()`, etc.

### Mobile Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| `expo` | 57 | Core framework |
| `expo-router` | 57 | File-based routing |
| `react-native` | 0.86 | UI framework |
| `@supabase/supabase-js` | 2.49 | Backend client |
| `zustand` | 5.0 | State management |
| `@react-native-async-storage/async-storage` | 2.2 | Local persistence |
| `lucide-react-native` | 0.468 | Icons |
| `react-native-reanimated` | 4.5 | Animations |
| `react-native-gesture-handler` | 2.32 | Touch gestures |
| `react-native-webview` | 13.16 | Marketplace WebViews |
| `expo-haptics` | 57 | Haptic feedback |
| `expo-secure-store` | 57 | Secure storage |
| `zod` | 3.24 | Schema validation |
| `date-fns` | 4.1 | Date formatting |

---

## 9. Data Flow & How Screens Connect

### Customer Journey

```
┌─────────────────────────────────────────────────────────────┐
│  1. DISCOVERY                                               │
│  Home → Browse categories → Tap product → Product Detail    │
│  Markets → Select marketplace → WebView browse → Tap product│
│  Search → Enter keyword → Results → Tap product             │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  2. PRODUCT DETAIL                                          │
│  • View images (carousel), variants, description            │
│  • Smart MOQ with suggested quantity buttons                │
│  • Auto-calculated shipping (air $8.50/kg, sea $2.20/kg)   │
│  • Real-time CNY→USD conversion                             │
│  • Add to cart with quantity                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  3. CART                                                    │
│  • View all items with CNY/USD prices                       │
│  • Adjust quantities                                        │
│  • See per-marketplace subtotals                            │
│  • Estimated total with shipping                            │
│  → Checkout                                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  4. CHECKOUT                                                │
│  • Select/add delivery address                              │
│  • Choose shipping method (Air / Sea)                       │
│  • Select payment method (ZAAD/Edahab/EVC/etc.)             │
│  • Review order summary                                     │
│  • Submit → Creates order in Supabase                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  5. ORDER TRACKING (15 stages)                              │
│  pending → confirmed → purchasing → purchased →             │
│  in_transit_china → warehouse → inspection → consolidated → │
│  shipped → in_transit → arrived_somalia → customs →         │
│  ready_for_pickup → out_for_delivery → delivered            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  6. DELIVERY                                                │
│  • Out for delivery notification                            │
│  • Delivered confirmation                                    │
│  • Rate & review                                            │
└─────────────────────────────────────────────────────────────┘
```

### Admin Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Admin Login → Dashboard                                    │
│  • View KPIs (revenue, orders, customers, shipments)        │
│  • See revenue chart (last 7 days)                          │
│  • Monitor order status distribution                        │
│  • Review activity feed                                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Order Management                                           │
│  • New order appears (status: pending)                      │
│  • Admin confirms → status: confirmed                       │
│  • Source from China → status: purchasing                   │
│  • Arrives in warehouse → status: warehouse                 │
│  • Inspect quality → status: inspection                     │
│  • Consolidate with other orders → consolidated             │
│  • Ship to Somalia → status: shipped                        │
│  • Track transit → in_transit → arrived_somalia             │
│  • Clear customs → customs → ready_for_pickup               │
│  • Deliver to customer → delivered                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Payment Reconciliation                                     │
│  • Customer pays via ZAAD/Edahab/EVC                        │
│  • Payment appears in admin (status: pending)               │
│  • Admin verifies & confirms → status: confirmed            │
│  • Bulk reconciliation mode for multiple payments           │
└─────────────────────────────────────────────────────────────┘
```

### Mobile ↔ Admin Data Sync

```
Mobile App                          Supabase                         Admin
─────────                          ────────                         ─────
Customer places order ──────────→ orders table ←──────────── Admin sees new order
  (local-first, then sync)                                     Admin updates status
Admin updates status ───────────→ orders table ────────────→ Mobile shows new status
Customer pays via ZAAD ─────────→ payments table ←────────── Admin confirms payment
Admin creates shipment ─────────→ shipments table ──────────→ Mobile shows tracking
Customer views tracking ─────────→ shipments table ←───────── Admin manages ETA
```

### Exchange Rate Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Open-ER API │────→│  Mobile App  │────→│  Display CNY │
│  (free,      │     │  (6h cache)  │     │  → USD price │
│   keyless)   │     │  AsyncStorage│     │  on product  │
└──────────────┘     └──────────────┘     └──────────────┘
                           │
                     Fallback: 7.25 CNY/USD
                     (offline mode)
```

### Shipping Calculation

```
Product Weight (kg) × Quantity = Total Weight (kg)

AIR FREIGHT:
  Total Weight × $8.50/kg = Shipping Cost
  Minimum charge: $15
  Delivery: 7-14 days

SEA FREIGHT:
  Max(Total Weight, 10kg min) × $2.20/kg = Shipping Cost
  Minimum charge: $25
  Delivery: 25-35 days
```

---

## 10. Deployment & CI/CD

### Web (Vercel)
- **Auto-deploys** on push to `main` branch
- **Build command**: `next build --webpack`
- **Framework**: Next.js 16
- **Domain**: chinasuuq.com (with www redirect)
- **Security headers**: HSTS, CSP, X-Frame-Options, etc.
- **Admin cache control**: `no-store, no-cache, must-revalidate, private`

### Mobile (EAS Build)
- **CI workflows**:
  - `build-dev.yml` — Triggers on push/PR to main
  - `production.yml` — Production builds + App Store submit
- **Build profiles**:
  - `development` — Dev client with Expo Go
  - `preview` — APK for testing
  - `production` — AAB for Play Store, IPA for App Store
- **Environment variables**: Supabase URL + anon key injected at build time

### Database (Supabase)
- **Hosting**: Supabase Cloud (AWS)
- **Region**: US East
- **Tables**: Products, Orders, Payments, Shipments, Profiles, etc.
- **Views**: Admin projections for dashboard queries
- **RLS**: Enabled on all tables
- **Realtime**: Enabled for order status updates

### Domain & DNS
- **Main domain**: chinasuuq.com (Vercel)
- **Admin**: chinasuuq.com/admin (same Vercel project)
- **API**: Direct Supabase REST API (no custom backend)

---

## Appendix A: Key Configuration Values

```typescript
// Supabase
SUPABASE_URL = "https://athkmrvsaijwgsyvwrbp.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIs..."

// WhatsApp
WHATSAPP_NUMBER = "8615277074143"
WHATSAPP_LINK = "https://wa.me/8615277074143"

// Exchange Rate
DEFAULT_EXCHANGE_RATE = 7.0 (CNY/USD)
FALLBACK_RATE = 7.25
CACHE_TTL = 6 hours

// Shipping
AIR_RATE_PER_KG = $8.50
AIR_MIN_CHARGE = $15
SEA_RATE_PER_KG = $2.20
SEA_MIN_CHARGE = $25
SEA_MIN_WEIGHT = 10kg

// Cart
MAX_CART_QUANTITY = 999
CART_STORAGE_KEY = "chinasuuq-cart"

// EAS Build
EAS_PROJECT_ID = "a8484922-0c4f-4f79-b4be-f93fe1dd5747"
EAS_OWNER = "baaaane24"
```

## Appendix B: Category List

| Slug | Emoji | English | Somali |
|------|-------|---------|--------|
| `electronics` | 📱 | Electronics | Elektiroonigga |
| `fashion` | 👗 | Fashion | Fashanka |
| `home-kitchen` | 🏠 | Home & Kitchen | Guriga |
| `beauty` | 💄 | Beauty | Quruxda |
| `baby-toys` | 🧸 | Baby & Toys | Carruurta |
| `tools-hardware` | 🔧 | Tools & Hardware | Qalabka |
| `shoes-bags` | 👟 | Shoes & Bags | Kabo |
| `automotive` | 🚗 | Automotive | Gaadiidka |
| `machinery` | ⚙️ | Machinery | Mashiinada |
| `construction` | 🏗️ | Construction | Dhismaha |
| `packaging` | 📦 | Packaging | Dhaqida |
| `business-supplies` | 💼 | Business Supplies | Alaabta Ganacsiga |

## Appendix C: Marketplace Platforms

| Marketplace | Brand Color | Description | Login Required |
|-------------|-------------|-------------|----------------|
| 1688 | `#FF5000` | China's #1 wholesale & factories | No |
| Taobao | `#FF6A00` | Retail giant — widest selection | Yes |
| YiwuGo | `#FF6600` | Yiwu small commodities | No |
| ChinaSuuq Deals | `#FF5A00` | Verified ready-stock | No |
| Alibaba | `#FF6A00` | B2B wholesale | Yes |
| ChinaGoods | `#FF5000` | Product sourcing | No |
| JD | `#E2231A` | Quality electronics & home | Yes |

## Appendix D: Order Status Labels

| Status | Label | Color |
|--------|-------|-------|
| `pending` | Pending | Amber |
| `confirmed` | Confirmed | Blue |
| `purchasing` | Purchasing | Purple |
| `purchased` | Purchased | Indigo |
| `in_transit_china` | In Transit (China) | Cyan |
| `warehouse` | In Warehouse | Teal |
| `inspection` | Under Inspection | Orange |
| `consolidated` | Consolidated | Pink |
| `shipped` | Shipped | Blue |
| `in_transit` | In Transit | Indigo |
| `arrived_somalia` | Arrived in Somalia | Green |
| `customs` | Customs Clearance | Amber |
| `ready_for_pickup` | Ready for Pickup | Green |
| `out_for_delivery` | Out for Delivery | Emerald |
| `delivered` | Delivered | Green |
| `cancelled` | Cancelled | Red |

## Appendix E: Payment Methods

| Method | Label | Region |
|--------|-------|--------|
| `zaad` | ZAAD | Somalia (Telesom) |
| `edahab` | Edahab | Somalia (Somtel) |
| `premier` | Premier Wallet | Somalia |
| `evc_plus` | EVC Plus | Somalia (Hormuud) |
| `sahal` | Sahal | Somalia |
| `bank_transfer` | Bank Transfer | International |
| `manual` | Manual | Any |

---

*This document was auto-generated from the ChinaSuuq codebase. For the latest changes, refer to the source code and git history.*
