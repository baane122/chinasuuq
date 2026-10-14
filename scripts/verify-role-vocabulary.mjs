/**
 * verify-role-vocabulary.mjs — executable proof that every copy of "is this a staff
 * account?" agrees with the database.
 *
 * WHY THIS EXISTS: the staff-role vocabulary is written down in four places —
 * `public.is_staff_or_admin()` in SQL (authoritative; it backs every `*_admin_all` RLS
 * policy), `apps/mobile/src/lib/roles.ts`, `apps/web/src/lib/roles.ts`, and
 * `apps/web/supabase/functions/_shared/auth.ts`. Before the 2026-10-14 audit they did NOT
 * agree: the SQL accepted `staff | super_admin | admin` while the mobile and web gates
 * accepted only the first two, so an `admin` login passed every database policy and then
 * found an empty customer app (or got signed straight out of /admin). The bug reads to the
 * customer as "staff features are broken", never as a vocabulary mismatch, and no type
 * checker can see it because the four lists are unrelated string literals in three
 * languages. This file makes them one contract.
 *
 * Run from the repo root:  node scripts/verify-role-vocabulary.mjs
 * No install, no device, no network, no database. Non-zero exit on the first mismatch.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsDir = join(root, "apps", "web", "supabase", "migrations");

// ── 1. the authoritative SQL ───────────────────────────────────────────────────
// Migrations are date/time-prefixed, so the last file (lexicographically) that
// re-creates the helper is what production runs. An older copy must never win.
function latestFunctionSource(name) {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const marker = `create or replace function public.${name}()`;
  let found = null;
  for (const file of files) {
    const src = readFileSync(join(migrationsDir, file), "utf8");
    const at = src.toLowerCase().indexOf(marker);
    if (at === -1) continue;
    // The body is a dollar-quoted block; migrations have used $fn$, $$ and
    // other tags over time, so read whichever tag opens right after the AS
    // keyword and stop at its matching close.
    const tail = src.slice(at);
    const open = /\$([A-Za-z0-9_]*)\$/u.exec(tail);
    assert.ok(open, `public.${name}() in ${file} has no dollar-quoted body — cannot read the helper`);
    const close = tail.indexOf(open[0], (open.index ?? 0) + open[0].length);
    assert.ok(close !== -1, `public.${name}() in ${file} has an unterminated dollar-quoted body`);
    const end = tail.indexOf(";", close);
    assert.ok(end !== -1, `public.${name}() in ${file} is not terminated by a semicolon`);
    found = { file, body: tail.slice(0, end + 1) };
  }
  assert.ok(found, `public.${name}() is not defined by any migration — this gate has lost its source of truth`);
  return found;
}

const staffFn = latestFunctionSource("is_staff_or_admin");
const superFn = latestFunctionSource("is_super_admin");

// A role token as written in SQL ('staff') or TypeScript ("staff").
const cleanRole = (s) => s.trim().replace(/^["']|["']$/g, "");

// The lockdown helper matches on `p.role::text IN ('a', 'b')` or `= 'a'`.
function rolesFrom(body, fnName) {
  const inList = /p\.role::text\s+IN\s*\(([^)]*)\)/i.exec(body);
  if (inList) {
    return inList[1].split(",").map(cleanRole).filter(Boolean);
  }
  const eq = /p\.role::text\s*=\s*'([^']+)'/i.exec(body);
  assert.ok(eq, `${fnName}() no longer compares p.role::text to a literal — update this gate`);
  return [eq[1]];
}

const SQL_STAFF = rolesFrom(staffFn.body, "is_staff_or_admin");
const SQL_SUPER = rolesFrom(superFn.body, "is_super_admin");

// The lockdown helper must be SECURITY DEFINER with a pinned search_path, or a
// caller can shadow `auth`/`pg_temp` mid-call and the whole gate is decorative.
for (const [name, fn] of [["is_staff_or_admin", staffFn], ["is_super_admin", superFn]]) {
  assert.match(fn.body, /SECURITY DEFINER/i, `public.${name}() lost SECURITY DEFINER (${fn.file})`);
  assert.match(fn.body, /SET search_path\s*=\s*public,\s*pg_temp/i, `public.${name}() no longer pins search_path (${fn.file})`);
}

// ── 2. the app + function copies ───────────────────────────────────────────────
const mobile = await import(pathToFileURL(join(root, "apps/mobile/src/lib/roles.ts")).href);
const web = await import(pathToFileURL(join(root, "apps/web/src/lib/roles.ts")).href);
const sharedAuth = readFileSync(join(root, "apps/web/supabase/functions/_shared/auth.ts"), "utf8");

const sorted = (a) => [...a].map(String).sort().join("|");
const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + " :: " + (e?.message ?? e)]);
  }
}

check(`SQL is the source of truth: is_staff_or_admin() accepts ${sorted(SQL_STAFF)}`, () => {
  assert.ok(SQL_STAFF.length >= 2, `unexpectedly thin staff list in ${staffFn.file}: ${sorted(SQL_STAFF)}`);
  assert.ok(SQL_STAFF.includes("staff") && SQL_STAFF.includes("super_admin"), `SQL dropped a core staff role: ${sorted(SQL_STAFF)}`);
  assert.ok(!SQL_STAFF.includes("customer") && !SQL_STAFF.includes("anon"), `SQL staff list contains a non-staff role: ${sorted(SQL_STAFF)}`);
});

check("mobile STAFF_PROFILE_ROLES == SQL", () => {
  assert.equal(sorted(mobile.STAFF_PROFILE_ROLES), sorted(SQL_STAFF), `apps/mobile/src/lib/roles.ts says ${sorted(mobile.STAFF_PROFILE_ROLES)}, ${staffFn.file} says ${sorted(SQL_STAFF)}`);
});

check("web STAFF_PROFILE_ROLES == SQL", () => {
  assert.equal(sorted(web.STAFF_PROFILE_ROLES), sorted(SQL_STAFF), `apps/web/src/lib/roles.ts says ${sorted(web.STAFF_PROFILE_ROLES)}, ${staffFn.file} says ${sorted(SQL_STAFF)}`);
});

check("edge-function staffGate + requireStaffOrAdmin == SQL", () => {
  // Both shorthands in _shared/auth.ts pass a literal role array to the gate.
  const gateList = /function staffGate[\s\S]{0,400}?roleGate\(req,\s*\[([^\]]*)\]/.exec(sharedAuth);
  assert.ok(gateList, "staffGate() no longer calls roleGate() with a literal role list — update this gate");
  const staffOrAdmin = /requireStaffOrAdmin[\s\S]{0,300}?requireRole\(req,\s*\[([^\]]*)\]/.exec(sharedAuth);
  assert.ok(staffOrAdmin, "requireStaffOrAdmin() no longer calls requireRole() with a literal role list — update this gate");
  for (const [label, m] of [["staffGate", gateList], ["requireStaffOrAdmin", staffOrAdmin]]) {
    const roles = m[1].split(",").map(cleanRole).filter(Boolean);
    assert.equal(sorted(roles), sorted(SQL_STAFF), `_shared/auth.ts ${label}() says ${sorted(roles)}, ${staffFn.file} says ${sorted(SQL_STAFF)}`);
  }
});

check("the app helpers answer exactly what the SQL answers", () => {
  for (const role of [...SQL_STAFF, "customer", "supplier", "anonymous", "anon", "", null, undefined]) {
    const expected = SQL_STAFF.includes(String(role));
    assert.equal(mobile.isStaffRole(role), expected, `mobile isStaffRole(${JSON.stringify(role)}) != is_staff_or_admin()`);
    assert.equal(web.isStaffRole(role), expected, `web isStaffRole(${JSON.stringify(role)}) != is_staff_or_admin()`);
  }
});

check("a future role fails closed in both apps", () => {
  // A new value added to the production enum must NOT inherit staff UI. If this
  // ever fails, someone widened a client list without widening SQL.
  assert.equal(mobile.isStaffRole("finance_manager"), false, "mobile granted staff access to an unknown role");
  assert.equal(web.isStaffRole("finance_manager"), false, "web granted staff access to an unknown role");
  assert.equal(mobile.isStaffRole(""), false);
  assert.equal(mobile.isStaffRole(null), false);
});

check("super-admin lists agree with is_super_admin()", () => {
  assert.equal(sorted(mobile.SUPER_ADMIN_PROFILE_ROLES), sorted(SQL_SUPER), `mobile SUPER_ADMIN_PROFILE_ROLES ${sorted(mobile.SUPER_ADMIN_PROFILE_ROLES)} vs SQL ${sorted(SQL_SUPER)}`);
  assert.equal(web.isSuperAdminRole("super_admin"), SQL_SUPER.includes("super_admin"), "web isSuperAdminRole() diverged from the SQL helper");
  for (const role of SQL_STAFF.filter((r) => !SQL_SUPER.includes(r))) {
    assert.equal(web.isSuperAdminRole(role), false, `web handed super-admin powers to ${role}`);
    assert.equal(mobile.isSuperAdminRole(role), false, `mobile handed super-admin powers to ${role}`);
  }
});

check("mobile's fail-closed deny-list and staff-list are disjoint", () => {
  // NON_STAFF_PROFILE_ROLES is the belt-and-braces list that must never overlap the
  // staff vocabulary, or "known non-staff" and "staff" both claim the same account.
  const overlap = mobile.NON_STAFF_PROFILE_ROLES.filter((r) => SQL_STAFF.includes(r));
  assert.deepEqual(overlap, [], `a role is both staff and explicitly non-staff: ${sorted(overlap)}`);
  assert.equal(mobile.isKnownNonStaffRole("customer"), true);
  assert.equal(mobile.isKnownNonStaffRole("admin"), false, "the legacy admin role must count as staff here — that was the 6.1 lockout");
  assert.equal(mobile.isKnownNonStaffRole(null), true, "no role means no staff chrome");
});

check("the granular RBAC taxonomy stays out of the coarse gate", () => {
  // packages/shared documents sourcing_agent / finance_manager / … . Those are
  // permission rows, not profiles.role values; if one ever lands in a client
  // staff list it silently grants Mission Control access.
  for (const list of [mobile.STAFF_PROFILE_ROLES, web.STAFF_PROFILE_ROLES]) {
    for (const role of list) {
      assert.ok(
        ["customer", "staff", "super_admin", "admin"].includes(role),
        `${role} is not a live user_role enum value — check migration 202609210001 before widening a gate`
      );
    }
  }
});

// ── report ─────────────────────────────────────────────────────────────────────
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed++;
  console.log(`${status === "PASS" ? "  ok  " : " FAIL "} ${name}`);
}
console.log(
  `\n${results.length - failed}/${results.length} staff-role vocabulary checks passed against ${staffFn.file}.`
);
process.exit(failed ? 1 : 0);
