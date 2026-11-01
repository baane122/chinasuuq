/**
 * verify-contract.mjs — no client may call an RPC or relation that does not
 * exist, or pass an argument name PostgREST does not know.
 *
 * WHY THIS EXISTS: `.rpc("name", { p_x: … })` is a string on the wire, so `tsc`
 * sees nothing. A renamed parameter is not a type error — PostgREST answers
 * `PGRST202` ("could not find the function … in the schema cache") at runtime,
 * and the screens that swallow `{ error }` show an empty list instead of a
 * failure. That is the same failure class as the 2026-10-31 column bugs
 * (`42703`/`PGRST204`), one level up: the function name and its argument names
 * are part of the API contract and nothing checked them.
 *
 * Checked, against `scripts/contract-snapshot.json` (exported from the live
 * project), for every client in the monorepo:
 *   · `.rpc("x")`                 — x must be a live function
 *   · `.rpc("x", { p_a, p_b })`   — every top-level key must be a live argument
 *   · `.from("t")`                — t must be a live table or view
 *
 * NOT checked: dynamically built names (`rpc(fnName)`) and objects with a
 * top-level spread, because their contents are not literals. Those are counted
 * and printed so the number cannot quietly grow.
 *
 * Run from apps/web:  npm run verify:contract
 * No network. Non-zero exit on the first unknown name.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = dirname(dirname(WEB_ROOT));
const SNAPSHOT = JSON.parse(
  readFileSync(join(WEB_ROOT, "scripts", "contract-snapshot.json"), "utf8")
);

const RPCS = new Map(Object.entries(SNAPSHOT.rpcs ?? {}));
const RELATIONS = new Set(SNAPSHOT.relations ?? []);

const CLIENT_DIRS = [
  join(WEB_ROOT, "src"),
  join(REPO_ROOT, "apps", "mobile", "src"),
  join(REPO_ROOT, "apps", "mobile", "app"),
  join(REPO_ROOT, "packages", "shared", "src"),
];

const files = [];
for (const dir of CLIENT_DIRS) {
  (function walk(p) {
    let entries;
    try {
      entries = readdirSync(p);
    } catch {
      return; // directory does not exist in this checkout
    }
    for (const name of entries) {
      const full = join(p, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(name)) {
        files.push(full);
      }
    }
  })(dir);
}

let problems = 0;
let dynamicCalls = 0;
const report = (file, line, msg) => {
  problems++;
  console.log(`  x ${relative(REPO_ROOT, file)}:${line} — ${msg}`);
};
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/** Read the balanced `{ … }` starting at `start`, honouring strings and
 *  template literals well enough for an object literal of literals. */
function readBalancedObject(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  return null;
}

/** Top-level keys of an object-literal body. `null` when a spread makes the
 *  key set unknowable. */
function topLevelKeys(body) {
  const keys = [];
  let depth = 0;
  let quote = null;
  let buf = "";
  const flush = () => {
    const entry = buf.trim();
    buf = "";
    if (!entry) return;
    if (entry.startsWith("...")) {
      keys.push(null); // opaque spread
      return;
    }
    // `p_items: [...]`, `p_items`, `"p_items": x` — take the key only, and only
    // when the value is separated by a colon at this depth.
    const m = /^(?:"([A-Za-z0-9_]+)"|'([A-Za-z0-9_]+)'|([A-Za-z_$][\w$]*))\s*:/.exec(entry);
    if (m) keys.push(m[1] ?? m[2] ?? m[3]);
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      buf += ch;
      if (ch === "\\") {
        buf += body[++i] ?? "";
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      flush();
      continue;
    }
    buf += ch;
  }
  flush();
  return keys.includes(null) ? null : keys;
}

const RE_RPC = /\.rpc\(\s*"([A-Za-z0-9_]+)"\s*(,?)/g;
const RE_FROM = /\.from\(\s*"([A-Za-z0-9_]+)"\s*\)/g;

console.log(
  `Scanning ${files.length} client files against ${RPCS.size} live RPCs and ${RELATIONS.size} live relations…`
);

for (const file of files) {
  const src = readFileSync(file, "utf8");

  for (const m of src.matchAll(RE_RPC)) {
    const name = m[1];
    const line = lineOf(src, m.index);
    if (!RPCS.has(name)) {
      const close = [...RPCS.keys()].filter((k) => !k.startsWith("_")).slice(0, 200);
      const suggestion = close.find((k) => k.includes(name) || name.includes(k));
      report(
        file,
        line,
        `rpc("${name}") is not a function on the live database` +
          (suggestion ? ` (did you mean "${suggestion}"?)` : "")
      );
      continue;
    }
    if (!m[2]) continue; // called with no arguments

    const commaAt = m.index + m[0].length - (m[2] === "," ? 1 : 0);
    const rest = src.slice(commaAt);
    const braceAt = rest.indexOf("{");
    const head = rest.slice(0, braceAt === -1 ? 40 : braceAt);
    if (braceAt === -1 || /\S/.test(head.replace(/^\s*,?\s*/, ""))) {
      dynamicCalls++; // `rpc("x", argsVariable)`
      continue;
    }
    const body = readBalancedObject(rest, braceAt);
    if (body === null) {
      dynamicCalls++;
      continue;
    }
    const keys = topLevelKeys(body);
    if (keys === null) {
      dynamicCalls++;
      continue;
    }
    const live = new Set(RPCS.get(name));
    for (const key of keys) {
      if (!live.has(key)) {
        report(
          file,
          line,
          `rpc("${name}", { ${key} }) — "${key}" is not an argument of that function ` +
            `(live: ${live.size ? [...live].join(", ") : "takes no arguments"})`
        );
      }
    }
  }

  for (const m of src.matchAll(RE_FROM)) {
    if (!RELATIONS.has(m[1])) {
      report(file, lineOf(src, m.index), `from("${m[1]}") is not a table or view on the live database`);
    }
  }
}

if (problems) {
  console.log(`\n${problems} contract violation(s).`);
  console.log(
    "If the change is intentional, apply the migration first, then refresh " +
      "scripts/contract-snapshot.json with scripts/refresh-contract-snapshot.sh."
  );
  process.exit(1);
}

console.log(`  ok  every .rpc() and .from() name exists on the live database`);
console.log(`  ok  every literal RPC argument name matches the function signature`);
if (dynamicCalls) {
  console.log(`  note  ${dynamicCalls} call(s) pass a non-literal argument object — not verified here`);
}
