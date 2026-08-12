// Server-rendered <head> for the admin section.
// This file is a Next.js route-segment head component: it's always
// server-rendered (even though the sibling layout.tsx is "use client"),
// and the meta tags it returns are injected into the page <head>.
//
// Purpose: mark the admin area as noindex/nofollow so the public
// site never links to or indexes any /admin/* route. Combined with
// the `no-store` cache headers, this prevents the admin from ever
// appearing in search results or being cached.
export default function AdminHead() {
  return (
    <>
      <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
      <meta name="googlebot" content="noindex, nofollow" />
    </>
  );
}
