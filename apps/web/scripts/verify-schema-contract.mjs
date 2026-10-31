/**
 * verify-schema-contract.mjs — no client may reference a column the database
 * does not have.
 *
 * WHY THIS EXISTS: the 2026-10-31 audit found four screens that were dead on
 * arrival for exactly this reason — all of them type-checked, linted and built:
 *
 *   admin/quotes      wrote `fees`          (live column is `service_fee`)
 *   admin/queue       read  `customer_name` (lives on the view, not `orders`)
 *   useProductVariants read `source_price`, `attributes`, `is_default`
 *   admin/shipments   wrote `total_packages: null` into a NOT NULL column
 *
 * `tsc` cannot see any of it: the Supabase client is typed loosely, so a wrong
 * column is a runtime 42703/PGRST204 and an error toast in production. This gate
 * compares every literal column list in `src/` against `schema-snapshot.json`
 * (exported from the live project) and fails on any unknown column.
 *
 * Scoped on purpose: it checks the *literal* shapes — `.from("t").select("a, b")`,
 * `.select("a, b")`, `.order("a")`, `.eq("a", …)` — not dynamically built
 * strings. Dynamic reads are covered by the runtime paths that already handle
 * 42703 and retry (isMissingColumnError).
 *
 * Refresh the snapshot after an intentional migration:
 *   psql "$DATABASE_URL" ... > scripts/schema-snapshot.json   (see README note)
 *
 * Run from apps/web:  npm run verify:schema
 * No network. Non-zero exit on any unknown column.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SNAPSHOT = JSON.parse(readFileSync(join(ROOT, "scripts/schema-snapshot.json"), "utf8"));
// Columns that exist on every PostgREST response select and are never declared
// per-table, plus embed aliases we intentionally allow.
const UNIVERSAL = new Set(["count", "*"]);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(p);
    } else if (/\.(ts|tsx)$/.test(name)) {
      files.push(p);
    }
  }
})(join(ROOT, "src"));

let problems = 0;
const report = (file, line, msg) => {
  problems++;
  console.log(`  ✗ ${relative(ROOT, file)}:${line} — ${msg}`);
};

/** Split a PostgREST column list, honouring `alias:column` and embedded
 *  resource syntax `other(inner, inner)`. */
function splitColumns(src) {
  const out = [];
  let depth = 0;
  let buf = "";
  for (const ch of src) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

function checkColumns(table, list, file, line, { allowEmbed = true } = {}) {
  if (!Object.prototype.hasOwnProperty.call(SNAPSHOT, table)) {
    report(file, line, `table "${table}" is not in the schema snapshot`);
    return;
  }
  const known = new Set(SNAPSHOT[table]);
  for (const raw of splitColumns(list)) {
    if (raw === "") continue;
    if (raw.startsWith("(") || raw === "*") continue;
    // embedded resource: other(col, col) — check the nested list against that
    // table when we know it, otherwise skip (it is a join, covered elsewhere).
    const embed = raw.match(/^([a-z_][a-z0-9_]*)\((.*)\)$/i);
    if (embed) {
      if (allowEmbed && SNAPSHOT[embed[1]]) {
        checkColumns(embed[1], embed[2], file, line, { allowEmbed: false });
      }
      continue;
    }
    const col = raw.includes(":") ? raw.split(":").pop().trim() : raw;
    if (UNIVERSAL.has(col)) continue;
    if (!known.has(col)) {
      report(file, line, `"${col}" is not a column of "${table}"`);
    }
  }
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

const RE_FROM = /\.from\(\s*"([a-z_][a-z0-9_]*)"\s*\)/g;
const RE_SELECT = /\.select\(\s*("([^"]*)"|`([^`]*)`)/g;
const RE_ORDER = /\.order\(\s*"([a-z_][a-z0-9_]*)"((?:\s*,\s*\{[^}]*\})?)/g;

console.log(`Scanning ${files.length} files against ${Object.keys(SNAPSHOT).length} tables…`);

for (const file of files) {
  const src = readFileSync(file, "utf8");

  // Pass 1: chained `.from("t")` … `.select(...)` within the same statement.
  for (const m of src.matchAll(RE_FROM)) {
    const table = m[1];
    const tail = src.slice(m.index, m.index + 1200);
    const sel = tail.match(/^\s*\.from\([^)]*\)[\s\S]{0,400}?\.select\(\s*("([^"]*)"|`([^`]*)`)/);
    if (sel) {
      const list = sel[2] ?? sel[3] ?? "";
      if (list && !list.includes("${")) {
        checkColumns(table, list, file, lineOf(src, m.index));
      }
    }
  }

  // Pass 2: order() columns. Only judged when the file talks to exactly one
  // known table, so an unrelated helper's variable cannot produce a false red.
  const candidates = [...new Set([...src.matchAll(RE_FROM)].map((m) => m[1]))].filter((t) => SNAPSHOT[t]);
  if (candidates.length === 1) {
    for (const m of src.matchAll(RE_ORDER)) {
      const col = m[1];
      if (!SNAPSHOT[candidates[0]].includes(col)) {
        report(file, lineOf(src, m.index), `order("${col}") is not a column of "${candidates[0]}"`);
      }
    }
  }
}

if (problems === 0) {
  console.log(`  ok  every literal column reference exists in the schema snapshot`);
  process.exit(0);
}
console.log(`\n${problems} schema-contract violation(s).`);
console.log("If a column was just added on purpose, refresh scripts/schema-snapshot.json.");
process.exit(1);
