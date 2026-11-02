import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Deno Edge Functions are validated by `supabase functions`/deploy, not
    // by the Node ESLint toolchain (Deno-style imports would false-positive).
    "supabase/functions/**",
  ]),

  {
    rules: {
      /**
       * `<img>` over `next/image` is deliberate here, not an oversight.
       *
       * The app is a STATIC EXPORT (`output: "export"` in next.config.ts) and
       * every product image is a hotlink to a marketplace CDN (1688, Taobao,
       * Yiwugo). With `images.unoptimized: true` there is no optimizer at
       * runtime, so <Image> would emit the same <img> plus a client wrapper and
       * a runtime width/height contract those URLs cannot satisfy.
       *
       * The three things this rule protects are handled explicitly at each call
       * site instead: `loading="lazy"` + `decoding="async"` on every list image,
       * an `onError` handler so an expired 1688 URL renders a placeholder rather
       * than a broken-image icon, and `referrerPolicy="no-referrer"` so the
       * marketplace CDNs serve the asset at all. Turn this back on only if the
       * site ever moves to a server renderer with an image loader.
       */
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
