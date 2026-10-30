// EAS postInstall: fix native modules whose android/build.gradle still calls
// jcenter(). jcenter() was sunset and is gone from the Gradle 9.3.1 the Expo
// 57 project uses, so any such module fails the whole build at the
// *configuration* phase with "Could not find method jcenter()".
//
// EAS runs this AFTER `npm ci` and BEFORE `./gradlew`, replacing every
// jcenter() occurrence with google() in any node_modules gradle file that
// still contains one. Idempotent; no-ops cleanly when nothing matches.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = process.cwd();
const nm = path.join(root, "node_modules");
if (!fs.existsSync(nm)) {
  console.log("[fix-jcenter] no node_modules at", nm, "- nothing to do");
  process.exit(0);
}

// find every .gradle/.kts under node_modules that still references jcenter()
const hits = [];
function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === ".bin") continue;
      walk(p);
    } else if (/\.(gradle|kts)$/.test(e.name)) {
      let text;
      try {
        text = fs.readFileSync(p, "utf8");
      } catch {
        continue;
      }
      if (/jcenter\(\)/.test(text)) {
        hits.push(p);
        fs.writeFileSync(p, text.replace(/\bjcenter\(\)/g, "google()"));
      }
    }
  }
}
walk(nm);

if (hits.length === 0) {
  console.log("[fix-jcenter] no jcenter() references found - nothing to patch.");
} else {
  for (const f of hits) console.log("[fix-jcenter] patched jcenter()->google():", f);
}
console.log("[fix-jcenter] done.", hits.length, "file(s) patched.");
