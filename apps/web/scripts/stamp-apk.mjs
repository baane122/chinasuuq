/**
 * stamp-apk.mjs — record which build the checked-in APK actually is.
 *
 * Run AFTER copying a fresh EAS artifact over public/app/chinasuuq.apk:
 *   cd apps/web && npm run apk:stamp -- --build <easBuildId>
 *   cd apps/web && npm run apk:stamp -- --reason "docs-only change, no rebuild"
 *
 * Writes apps/mobile/apk-manifest.json, which verify:apk then holds the repo to.
 * The digest covers exactly the files Metro bundles (see BUNDLE_PATHS /
 * BUNDLE_FILES in verify-apk-freshness.mjs), so documentation and script edits
 * do not demand a new binary — but any change under apps/mobile/app, src or
 * assets does.
 *
 * Anything it cannot verify it refuses to guess: a `--build <id>` is looked up
 * on EAS and must be FINISHED and match the artifact's sha256, so the manifest
 * cannot claim provenance it does not have.
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = dirname(dirname(WEB_ROOT));
const APK = join(WEB_ROOT, "public", "app", "chinasuuq.apk");
const OUT = join(REPO_ROOT, "apps", "mobile", "apk-manifest.json");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1] ?? "";
};

const reason = flag("reason");
const buildId = flag("build");

if (!statSync(APK, { throwIfNoEntry: false })) {
  console.error(`stamp-apk: ${APK} does not exist`);
  process.exit(1);
}

const bytes = readFileSync(APK);
const sha256 = createHash("sha256").update(bytes).digest("hex");

const BUNDLE_PATHS = ["apps/mobile/app/", "apps/mobile/src/", "apps/mobile/assets/"];
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
const tracked = execFileSync("git", ["ls-files", "-z", "apps/mobile"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
}).split("\0").filter(Boolean);
const bundled = tracked
  .filter((f) => BUNDLE_PATHS.some((p) => f.startsWith(p)) || BUNDLE_FILES.includes(f))
  .sort();
const h = createHash("sha256");
for (const f of bundled) {
  h.update(f);
  h.update("\0");
  h.update(readFileSync(join(REPO_ROOT, f)));
  h.update("\0");
}
const sourceDigest = h.digest("hex");

const appJson = JSON.parse(readFileSync(join(REPO_ROOT, "apps", "mobile", "app.json"), "utf8"));
const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
let builtFrom = gitCommit;

let build = null;
let versionCode = null;
if (buildId) {
  let view;
  try {
    view = JSON.parse(
      execFileSync("npx", ["eas-cli", "build:view", buildId, "--json"], {
        cwd: join(REPO_ROOT, "apps", "mobile"),
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      })
    );
  } catch (e) {
    console.error(`stamp-apk: could not read EAS build ${buildId} (${e.message.split("\n")[0]})`);
    process.exit(1);
  }
  if (view.status !== "FINISHED") {
    console.error(`stamp-apk: EAS build ${buildId} is ${view.status}, not FINISHED`);
    process.exit(1);
  }
  build = buildId;
  versionCode = view.appBuildVersion ?? null;
  // Record the commit the BINARY was built from, not the commit we happen to be
  // standing on. Recording HEAD here would be a lie the moment the tree has moved
  // on, and provenance is the entire point of this file.
  if (view.gitCommitHash) {
    if (view.gitCommitHash !== gitCommit) {
      console.warn(
        `stamp-apk: note — build ${buildId} was made from ${view.gitCommitHash.slice(0, 7)}, ` +
          `the working tree is ${gitCommit.slice(0, 7)}. Recording the BUILD's commit.`
      );
    }
    builtFrom = view.gitCommitHash;
  }
}

const manifest = {
  _comment:
    "Provenance of apps/web/public/app/chinasuuq.apk. Written by `npm run apk:stamp` " +
    "(apps/web/scripts/stamp-apk.mjs) and enforced by `npm run verify:apk`. " +
    "sourceDigest covers only the files Metro bundles (apps/mobile/{app,src,assets} + configs), " +
    "so docs and tooling edits do not force a rebuild.",
  appVersion: appJson.expo?.version ?? null,
  androidVersionCode: versionCode,
  easBuildId: build,
  gitCommit: builtFrom,
  sha256,
  bytes: bytes.length,
  entries: null,
  sourceDigest,
  stampedAt: new Date().toISOString(),
  reason: reason ?? null,
};

// Entry count, read straight from the central directory (no unzip dependency) so
// a truncated artifact cannot be stamped as good.
{
  const min = Math.max(0, bytes.length - 65558);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= min; i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) {
    console.error("stamp-apk: no zip central directory — refusing to stamp a truncated file");
    process.exit(1);
  }
  manifest.entries = bytes.readUInt16LE(eocd + 10);
  if (manifest.entries < 500) {
    console.error(`stamp-apk: only ${manifest.entries} zip entries — refusing to stamp`);
    process.exit(1);
  }
}

writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");
console.log(`stamp-apk: ${manifest.appVersion} build ${manifest.easBuildId ?? "(unrecorded)"}, ` +
  `${manifest.bytes} bytes, ${manifest.entries} entries, sha ${sha256.slice(0, 16)}…`);
console.log(`stamp-apk: wrote ${OUT.replace(REPO_ROOT + "/", "")}`);
if (!buildId && !reason) {
  console.log("");
  console.log("  NOTE: no --build and no --reason. This records the binary as-is without");
  console.log("  provenance. Prefer `--build <easBuildId>` after a real build.");
}
