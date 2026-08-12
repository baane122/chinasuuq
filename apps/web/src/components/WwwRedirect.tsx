"use client";

import { useEffect } from "react";

/**
 * Client-side www → apex redirect.
 * Only fires on the www subdomain, so it never loops once the user lands
 * on chinasuuq.com. Used because the static export cannot express
 * host-level redirects at the edge.
 */
export function WwwRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hostname === "www.chinasuuq.com") {
      window.location.replace(
        "https://chinasuuq.com" +
          window.location.pathname +
          window.location.search +
          window.location.hash,
      );
    }
  }, []);
  return null;
}
