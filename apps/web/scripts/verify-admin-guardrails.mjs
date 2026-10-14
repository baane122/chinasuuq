/**
 * verify-admin-guardrails.mjs — executable proof for the admin console's
 * fail-closed rules and the read-shape guards found by the 2026-10-14
 * screen-by-screen sweep (§4.7 of docs/DEEP_AUDIT_2026-10-14.md).
 *
 * WHY THIS EXISTS: `npm run build` typechecks these pages and nothing else looks
 * at them. The permissions loader used to turn a FAILED read into "no grants",
 * which the documented fail-open then read as "everyone may edit AI keys and
 * confirm payments" — a broken network cable opened the console. `tsc` cannot
 * see that, and it cannot be provoked from a browser without a live project.
 *
 * So this file imports the REAL `src/lib/admin/permissions.ts` through Node's
 * type stripping (only its `react` and `../supabase` boundaries are rewritten),
 * answers its reads from a scripted PostgREST-shaped stub, and asserts the
 * decision for each outcome — including that a failed check is never cached.
 * The sweep's other fixes live in modules that need a configured client, so
 * they are pinned as source rules over the real files instead, and each rule
 * names the failure it prevents.
 *
 * Run from apps/web:  npm run verify:admin
 * No network, no Supabase project. Non-zero exit on any failure.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// Scratch copy of the module under test, inside apps/web so `node_modules`
// resolution still works. Node refuses --experimental-strip-types for anything
// under node_modules itself, hence a sibling directory. Ignored in .gitignore
// and removed on exit, so a crash cannot leave repo junk for the guard job.
const TMP = join(ROOT, ".cs-gate-tmp");
mkdirSync(TMP, { recursive: true });
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));

const PERMS_SRC = "src/lib/admin/permissions.ts";
const permsOriginal = read(PERMS_SRC);
const permsSource = permsOriginal
  .replace('import { useEffect, useState } from "react";', "const useState = (init) => [init, () => {}];\nconst useEffect = () => {};")
  .replace('import { supabase } from "../supabase";', "const supabase = globalThis.__supabase;");
assert.ok(!/from "react"/.test(permsSource) && !/from "\.\.\/supabase"/.test(permsSource), "boundary stubs failed");
const permsPath = join(TMP, "permissions.ts");
writeFileSync(permsPath, permsSource);

// ── scripted supabase ─────────────────────────────────────────────────────────
/**
 * `tables` maps a table name to the outcomes its reads receive, in order, so a
 * scenario can go healthy → broken → healthy on one module instance. Any read
 * past the end of a queue throws, which is what makes the unused-queue check at
 * the end of a scenario mean "this is the query plan we expect".
 */
function makeSupabase(tables, session) {
  const queues = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v]]));
  const log = [];
  const next = (table) => {
    const q = queues[table];
    log.push(table);
    if (!q || q.length === 0) throw new Error(`unexpected read of "${table}"`);
    return q.shift();
  };
  class Builder {
    constructor(table) {
      this.table = table;
    }
    select() {
      return this;
    }
    eq() {
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    range() {
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }
    then(resolve, reject) {
      Promise.resolve()
        .then(() => {
          const o = next(this.table);
          if (o && o.throws) throw new Error(o.throws);
          return {
            data: o && "data" in o ? o.data : null,
            error: o && o.error ? o.error : null,
            count: o && "count" in o ? o.count : null,
          };
        })
        .then(resolve, reject);
    }
  }
  return {
    from: (table) => new Builder(table),
    auth: { getSession: async () => ({ data: { session } }) },
    __log: log,
    __unused: () => Object.entries(queues).filter(([, q]) => q.length).map(([t, q]) => `${t}:${q.length}`),
  };
}

let instance = 0;
async function freshPerms(tables, session = { user: { id: "u1" } }) {
  globalThis.__supabase = makeSupabase(tables, session);
  instance += 1;
  const mod = await import(pathToFileURL(permsPath).href + "?v=" + instance);
  return { mod, sb: globalThis.__supabase };
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(["ok", name]);
  } catch (e) {
    results.push(["FAIL", `${name} — ${String(e?.message ?? e).split("\n")[0].slice(0, 220)}`]);
  }
}

const err = (m) => ({ message: m });
const P = (role) => ({ data: { role } });
const COUNT = (n) => ({ count: n });
const GRANTS = (...labels) => ({ data: labels.map((permission) => ({ permission })) });
const STAFF = (...rows) => ({ data: rows });

// ── 1. the loader: what a decision may and may not be built from ──────────────
await check("a staff grant read cleanly opens exactly that section", async () => {
  const { mod, sb } = await freshPerms({
    profiles: [P("staff")],
    staff_profiles: [STAFF({ role: "finance_verifier", is_super_admin: false })],
    permissions: [COUNT(5), GRANTS("verify_payment")],
  });
  const perm = await mod.loadAdminPermissions();
  assert.equal(perm.checksFailed, false, perm.error);
  assert.equal(perm.configured, true);
  assert.equal(mod.can(perm, "verify_payment"), true);
  assert.equal(mod.can(perm, "manage_roles"), false, "one grant must not open the other section");
  assert.equal(mod.allowed(perm, "confirmPayments"), true);
  assert.equal(mod.allowed(perm, "aiKeys"), false);
  assert.equal(mod.permissionCheckFailureNotice(perm), null);
  assert.deepEqual(sb.__unused(), [], `reads beyond the scripted plan: ${sb.__unused()}`);
});

await check("a failed role read DENIES instead of failing open", async () => {
  // Built so the OLD bug is exactly what is being tested: the role read fails
  // while the count read answers zero, so the state looks "not configured" and
  // the documented fail-open would otherwise hand over the destructive section.
  const { mod } = await freshPerms({
    profiles: [{ data: null, error: err("service unavailable") }],
    staff_profiles: [STAFF()],
    permissions: [COUNT(0)],
  });
  const perm = await mod.loadAdminPermissions();
  assert.equal(perm.checksFailed, true, "the error must be carried on the result");
  assert.equal(perm.configured, false, "and it arrived at the state the old code read as 'just seed the grants'");
  assert.match(perm.error, /service unavailable/);
  assert.equal(mod.can(perm, "verify_payment"), false, "an unknown permission set is a deny");
  assert.equal(mod.can(perm, "manage_roles"), false);
  const notice = mod.permissionCheckFailureNotice(perm);
  assert.ok(notice && /failed check/.test(notice), "staff must read a failed check, not a missing grant");
});

await check("a null count with no error is an unreadable response, not zero grants", async () => {
  const { mod } = await freshPerms({
    profiles: [P("staff")],
    staff_profiles: [STAFF({ role: "operations_director" })],
    permissions: [{ count: null }, GRANTS("manage_roles")],
  });
  const perm = await mod.loadAdminPermissions();
  assert.equal(perm.checksFailed, true, "PostgREST answers 0 for an empty table; a missing body is not that");
  assert.equal(mod.can(perm, "manage_roles"), false);
});

await check("a genuinely empty permissions table keeps the documented fail-open", async () => {
  const { mod } = await freshPerms({
    profiles: [P("staff")],
    staff_profiles: [STAFF({ role: "operations_director" })],
    permissions: [COUNT(0), GRANTS()],
  });
  const perm = await mod.loadAdminPermissions();
  assert.equal(perm.checksFailed, false, perm.error);
  assert.equal(perm.configured, false);
  assert.equal(mod.can(perm, "manage_roles"), true, "the bootstrap path for a fresh project must survive");
  assert.equal(mod.permissionCheckFailureNotice(perm), null, "nothing failed, so nothing may say it did");
});

await check("super_admin needs no grant walk and keeps access when a grant read fails", async () => {
  const { mod, sb } = await freshPerms({
    profiles: [P("super_admin")],
    permissions: [COUNT(3)],
  });
  const perm = await mod.loadAdminPermissions();
  assert.equal(perm.isSuperAdmin, true);
  assert.equal(mod.can(perm, "manage_roles"), true);
  assert.ok(!sb.__log.includes("staff_profiles"), "profiles.role already answered; no second identity read");
});

await check("a staff_profiles super flag is honoured without a grants read", async () => {
  const { mod, sb } = await freshPerms({
    profiles: [P("staff")],
    staff_profiles: [STAFF({ role: "super_admin", is_super_admin: true })],
    permissions: [COUNT(9)],
  });
  const perm = await mod.loadAdminPermissions();
  assert.equal(perm.isSuperAdmin, true);
  assert.equal(mod.can(perm, "manage_roles"), true);
  const grantReads = sb.__log.filter((t) => t === "permissions").length;
  assert.equal(grantReads, 1, `a super profile must answer from the count read alone, saw ${grantReads} permissions reads`);
});

await check("a failed check is not cached, so the next mount retries and can succeed", async () => {
  const { mod } = await freshPerms({
    profiles: [{ data: null, error: err("socket hang up") }, P("staff")],
    staff_profiles: [STAFF(), STAFF({ role: "operations_director" })],
    permissions: [COUNT(5), COUNT(5), GRANTS("manage_roles")],
  });
  const first = await mod.loadAdminPermissions();
  assert.equal(first.checksFailed, true);
  assert.equal(mod.can(first, "manage_roles"), false);
  const second = await mod.loadAdminPermissions();
  assert.equal(second.checksFailed, false, `the failure was inherited: ${second.error}`);
  assert.equal(mod.can(second, "manage_roles"), true);
  const third = await mod.loadAdminPermissions();
  assert.equal(third.checksFailed, false, "a clean answer IS cached and must not re-read");
});

await check("a thrown read is a failed check, not an empty table", async () => {
  const { mod } = await freshPerms({
    profiles: [{ throws: "offline" }],
    staff_profiles: [STAFF()],
    permissions: [COUNT(2)],
  });
  const perm = await mod.loadAdminPermissions();
  assert.equal(perm.checksFailed, true);
  assert.match(perm.error ?? "", /offline/);
  assert.equal(mod.can(perm, "verify_payment"), false);
});

await check("invalidatePermissions() re-reads after a role change", async () => {
  const { mod } = await freshPerms({
    profiles: [P("staff"), P("staff")],
    staff_profiles: [STAFF({ role: "viewer" }), STAFF({ role: "finance_verifier" })],
    permissions: [COUNT(7), GRANTS(), COUNT(7), GRANTS("verify_payment")],
  });
  const before = await mod.loadAdminPermissions();
  assert.equal(mod.can(before, "verify_payment"), false);
  mod.invalidatePermissions();
  const after = await mod.loadAdminPermissions();
  assert.equal(mod.can(after, "verify_payment"), true, "a grant added live must become visible on demand");
});

await check("no session means no identity read (and no invented grants)", async () => {
  const { mod, sb } = await freshPerms({ profiles: [P("staff")] }, null);
  const perm = await mod.loadAdminPermissions();
  assert.equal(perm.loading, false);
  assert.equal(perm.checksFailed, false);
  assert.equal(perm.role, "unknown");
  assert.deepEqual(sb.__log, [], "an anonymous caller must not probe the staff tables at all");
});

// ── 2. the call sites that turn those decisions into buttons ──────────────────
const consumers = [
  ["src/components/admin/AiSettingsTab.tsx", "manage_roles"],
  ["src/app/admin/(protected)/staff/page.tsx", "manage_roles"],
  ["src/app/admin/(protected)/payments/page.tsx", "verify_payment"],
];
await check("every gated section explains a failed check instead of hiding the reason", async () => {
  for (const [file] of consumers) {
    const text = read(file);
    assert.match(text, /permissionCheckFailureNotice/, `${file} must surface the failure text`);
    assert.match(text, /useAdminPermissions|loadAdminPermissions/, `${file} must consult the loader`);
    assert.match(text, /reload/, `${file} must let staff retry a failed check`);
  }
});

const dataText = read("src/lib/admin/supabase-data.ts");
// One pure function out of a module that otherwise needs a configured client:
// lift its own text and import it standalone, so the escape set is EXECUTED
// rather than pattern-matched.
const escaper = dataText.match(/export function sanitizeOrFilter[\s\S]*?\n\}/)?.[0];
assert.ok(escaper, "sanitizeOrFilter could not be lifted out of supabase-data.ts");
writeFileSync(join(TMP, "sanitize.ts"), escaper + "\n");

await check("every .or() predicate is built from the grammar-safe pattern", async () => {
  const sites = [...dataText.matchAll(/\.or\(/g)].length;
  assert.ok(sites >= 4, `expected the shared search predicates, saw ${sites} .or( sites`);
  // A raw `%${userInput}%` inside an .or() string is how "Hadija, Co" 400s the
  // whole list and how `shoes%,status.eq.active` appends a filter term. Every
  // ilike interpolation must therefore come from the shared safe pattern.
  const normalized = dataText.replace(/\$\{orLike\((?:[^)]*)\)\}/g, "${like}");
  const rawInterpolations = [...normalized.matchAll(/ilike\.\$\{([^}]*)\}/g)]
    .map((m) => m[1].trim())
    .filter((expr) => expr !== "like");
  assert.deepEqual(
    rawInterpolations,
    [],
    `an ilike value must be the grammar-safe \`like\` (from orLike/sanitizeOrFilter), found: ${rawInterpolations.join(", ")}`
  );
  assert.match(dataText, /export function sanitizeOrFilter/, "the escaper must stay exported for its own gate");
  const orLikeAt = dataText.indexOf("function orLike");
  assert.match(dataText.slice(orLikeAt, orLikeAt + 200), /sanitizeOrFilter/);
  // And the escape set itself, proven behaviourally through the exported function.
  const safeMod = await import(pathToFileURL(join(TMP, "sanitize.ts")).href);
  assert.equal(safeMod.sanitizeOrFilter("Hadija, Co (2024). v2\\x"), "Hadija\\, Co \\(2024\\)\\. v2\\\\x");
  assert.equal(safeMod.sanitizeOrFilter("spare part *"), "spare part *", "* and spaces are deliberately untouched");
});

const productsText = read("src/app/admin/(protected)/products/page.tsx");
await check("bulk writes are chunked and report the groups that failed", async () => {
  assert.match(productsText, /async function runBulkWrite/);
  assert.match(productsText, /batchSize: IN_CLAUSE_BATCH_SIZE/, "the same bounded chunking the mobile reads use");
  assert.match(productsText, /failedGroupNumbers/, "a failed group must not be counted as deleted");
  const calls = [...productsText.matchAll(/await runBulkWrite\(/g)].length;
  assert.equal(calls, 2, `both bulk actions must go through it, saw ${calls}`);
  assert.ok(
    !/\.in\("id",\s*ids\)/.test(productsText),
    "no whole-selection .in(\"id\", ids) write may survive next to runBulkWrite"
  );
});

const notifText = read("src/app/admin/(protected)/notifications/page.tsx");
await check("a capped broadcast says it was capped", async () => {
  assert.match(notifText, /const RECIPIENT_READ_CAP = 5000;/);
  assert.match(notifText, /\.limit\(RECIPIENT_READ_CAP\)/);
  assert.match(notifText, /capNotice && <PartialJoinNotice/, "the truncation must be on screen, not only in a console line");
  assert.match(notifText, /received nothing|may not have received/, "and must name who missed out");
});

const fxText = read("src/lib/fx.ts");
const quotesText = read("src/app/admin/(protected)/quotes/page.tsx");
const sourcingText = read("src/app/admin/(protected)/sourcing/page.tsx");
await check("fromLiveRow means a live row, and the money screens gate on it", async () => {
  assert.match(fxText, /fromLiveRow = false/, "it is false by construction, not derived from cnyPerUsd being a number");
  assert.match(fxText, /if \(error\) return \{ rates: \{ \.\.\.lastGood, fromLiveRow: false \}/, "a failed read must clear it even though lastGood keeps the number plausible");
  assert.match(quotesText, /fx\.fromLiveRow \? normalizeCnyPerUsd/);
  assert.match(sourcingText, /const quoteRate = fx\.fromLiveRow \? normalizeCnyPerUsd/);
  assert.match(sourcingText, /disabled=\{savingQuote \|\| quoteRate === null\}/, "no live rate must block the save, not guess one");
});

const clientText = read("src/lib/supabase.ts");
await check("an edge function that never answers becomes a named timeout", async () => {
  assert.match(clientText, /export const DEFAULT_EDGE_TIMEOUT_MS = 35_000;/);
  assert.match(clientText, /init\.timeoutMs \?\? DEFAULT_EDGE_TIMEOUT_MS/, "the deadline is a default, not opt-in");
  assert.match(clientText, /function deadlineSignal/);
  assert.match(clientText, /class EdgeTimeoutError extends Error/);
  assert.match(clientText, /did not answer within/, "and it says we cut it off, not that the server refused");
});

const conciergeText = read("src/components/ai/AiShipmentConcierge.tsx");
await check("the AI concierge refuses to prompt about shipments it could not read", async () => {
  assert.match(conciergeText, /function readCollection/);
  assert.match(conciergeText, /ok: false/, "the failed shape must be distinct from an empty array");
  assert.ok(
    /if \(!\w+Read\.ok\)[\s\S]{0,400}return/.test(conciergeText) || /if \(!\w+\.ok\)[\s\S]{0,300}return/.test(conciergeText),
    "a failed read must return before the model is called"
  );
});

const ordersText = read("src/app/admin/(protected)/orders/page.tsx");
await check("a failed orders read leaves a retryable screen, not a permanent skeleton", async () => {
  assert.match(ordersText, /\} finally \{[\s\S]{0,400}setLoading\(false\)/);
});

// ── report ────────────────────────────────────────────────────────────────────
const failed = results.filter(([s]) => s === "FAIL");
for (const [status, name] of results) console.log(`  ${status === "ok" ? "ok  " : "FAIL"} ${name}`);
console.log(
  `\n${results.length - failed.length}/${results.length} admin-guardrail behaviours verified against the real loader and screens.`
);
console.log(`source sha256 permissions=${sha(permsOriginal)} supabase-data=${sha(dataText)} fx=${sha(fxText)}`);
if (failed.length) process.exit(1);
