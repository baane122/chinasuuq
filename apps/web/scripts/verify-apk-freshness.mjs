/**
 * verify-apk-freshness.mjs — the checked-in APK must be the binary the app
 * source says it is.
 *
 * WHY THIS EXISTS: `apps/web/public/app/chinasuuq.apk` is a checked-in binary
 * and nothing rebuilds it. On 2026-10-30 it was found sitting at v1.0.2 from
 * 2 October while the app had moved to 1.0.6 — customers had been downloading a
 * five-week-old build through five weeks of fixes, and every gate was green,
 * because "the file exists and is a valid zip" says nothing about *which* build
 * it is.
 *
 * Three separate lies are possible, so this checks three things:
 *   1. bytes    — the file's sha256 must equal `sha256` in apk-manifest.json, so
 *                 a binary cannot be swapped without its provenance changing.
 *   2. source   — the digest of the files Metro actually bundles must equal
 *                 `sourceDigest`, so shipping new mobile code without a new APK
 *                 fails instead of silently serving the old one.
 *   3. version  — `expo.version` must equal the manifest's `appVersion`, so a
 *                 version bump cannot ride in on the old binary.
 * Plus an independent zip-structure check (central directory found, entry count,
 * and `assets/index.android.bundle` present) so a truncated download fails here
 * rather than on a customer's phone.
 *
 * The manifest is written by `npm run apk:stamp` after every build — see the
 * "APK release process" section of doc.md.
 *
 * Run from apps/web:  npm run verify:apk
 * No network. Non-zero exit on any mismatch.
 */

import { readFileSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = dirname(dirname(WEB_ROOT));
const APK = join(WEB_ROOT, "public", "app", "chinasuuq.apk");
const MANIFEST = join(REPO_ROOT, "apps", "mobile", "apk-manifest.json");

let problems = 0;
const fail = (msg) => {
  problems++;
  console.log(`  x ${msg}`);
};
const ok = (msg) => console.log(`  ok  ${msg}`);

if (!statSync(APK, { throwIfNoEntry: false })) {
  console.log(`  x ${relative(REPO_ROOT, APK)} does not exist`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch (e) {
  console.log(`  x ${relative(REPO_ROOT, MANIFEST)} is missing or unreadable`);
  console.log("    Every shipped APK needs provenance. Run `npm run apk:stamp` in apps/web.");
  process.exit(1);
}

// ── 1. bytes ────────────────────────────────────────────────────────────────
const bytes = readFileSync(APK);
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (manifest.sha256 !== sha256) {
  fail(
    `APK sha256 is ${sha256.slice(0, 16)}… but the manifest records ` +
      `${String(manifest.sha256 ?? "(none)").slice(0, 16)}… — the binary was replaced ` +
      `without re-stamping.`
  );
} else if (manifest.bytes !== bytes.length) {
  fail(`APK is ${bytes.length} bytes but the manifest records ${manifest.bytes}.`);
} else {
  ok(`sha256 ${sha256.slice(0, 16)}… matches the manifest`);
}

// ── 2. source ───────────────────────────────────────────────────────────────
// Only what Metro bundles: the app directory, src, assets and the configs that
// change the bundle. Deliberately NOT docs, scripts, tests or the manifest
// itself — those must not force an APK rebuild.
const BUNDLE_PATHS = [
  "apps/mobile/app/",
  "apps/mobile/src/",
  "apps/mobile/assets/",
];
const BUNDLE_FILES = [
  "apps/mobile/app.json",
  "apps/mobile/app.config.js",
  "apps/mobile/package.json",
  "apps/mobile/package-lock.json",
  "apps/mobile/babel.config.js",
  "apps/mobile/metro.config.js",
  "apps/mobile/tsconfig.json",
  "apps/mobile/index.js",
];

let tracked = [];
try {
  tracked = execFileSync("git", ["ls-files", "-z", "apps/mobile"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
} catch {
  console.log("  x could not read git ls-files — the source digest needs a git checkout");
  process.exit(1);
}

const bundled = tracked
  .filter(
    (f) => BUNDLE_PATHS.some((p) => f.startsWith(p)) || BUNDLE_FILES.includes(f)
  )
  .sort();

if (bundled.length < 50) {
  fail(
    `only ${bundled.length} bundled source files were found — this looks like a shallow or ` +
      `partial checkout, and a digest over it would be meaningless`
  );
} else {
  const h = createHash("sha256");
  for (const f of bundled) {
    h.update(f);
    h.update("\0");
    try {
      h.update(readFileSync(join(REPO_ROOT, f)));
    } catch {
      h.update("<unreadable>");
    }
    h.update("\0");
  }
  const digest = h.digest("hex");
  if (manifest.sourceDigest !== digest) {
    fail(
      `the mobile bundle sources changed since this APK was built ` +
        `(${bundled.length} files hashed, now ${digest.slice(0, 16)}…, manifest has ` +
        `${String(manifest.sourceDigest ?? "(none)").slice(0, 16)}…).`
    );
    console.log("");
    console.log("    The APK at apps/web/public/app/chinasuuq.apk was NOT rebuilt from this");
    console.log("    source, so customers would download an older app than the repo describes.");
    console.log("    Either build and ship a new APK, or — if the change genuinely cannot");
    console.log("    affect the bundled app — re-stamp with:");
    console.log("");
    console.log("      cd apps/web && npm run apk:stamp -- --reason \"docs only\"");
    console.log("");
  } else {
    ok(`bundle source digest ${digest.slice(0, 16)}… matches (${bundled.length} files)`);
  }
}

// ── 3. version ──────────────────────────────────────────────────────────────
let expoVersion = null;
try {
  expoVersion = JSON.parse(
    readFileSync(join(REPO_ROOT, "apps", "mobile", "app.json"), "utf8")
  ).expo?.version;
} catch {
  fail("apps/mobile/app.json could not be read");
}
if (expoVersion && manifest.appVersion !== expoVersion) {
  fail(
    `app.json says version ${expoVersion} but the shipped APK is version ` +
      `${manifest.appVersion} (build ${manifest.easBuildId ?? "?"}).`
  );
} else if (expoVersion) {
  ok(`version ${expoVersion} matches the manifest`);
}

// ── 4. zip structure (no `unzip` dependency) ────────────────────────────────
function readZipSummary(buf) {
  // End of central directory: 0x06054b50 in the last 64 KiB + 22.
  const min = Math.max(0, buf.length - 65558);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset <= 0 || cdOffset >= buf.length) return null;
  // Walk central-directory headers and collect the last two names cheaply.
  const names = [];
  let p = cdOffset;
  for (let i = 0; i < entries && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.toString("utf8", p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (names.length !== entries) return null;
  return { entries, names };
}

const zip = readZipSummary(bytes);
if (!zip) {
  fail("the APK has no readable central directory — it is truncated or not a zip");
} else if (zip.entries < 500) {
  fail(`the APK central directory lists ${zip.entries} entries; a real build has >500`);
} else if (!zip.names.includes("assets/index.android.bundle")) {
  fail("the APK has no assets/index.android.bundle — it is not a JS bundle build");
} else {
  ok(`zip is complete: ${zip.entries} entries including the JS bundle`);
}

if (problems) {
  console.log(`\n${problems} APK freshness problem(s). See doc.md §9 "APK release process".`);
  process.exit(1);
}

console.log(
  `\nAPK provenance OK — build ${manifest.easBuildId ?? "?"}, commit ` +
    `${String(manifest.gitCommit ?? "?").slice(0, 7)}, ${manifest.appVersion}.`
);
