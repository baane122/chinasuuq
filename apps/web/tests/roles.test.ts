import { describe, expect, it } from "vitest";
import {
  isStaffRole,
  isSuperAdminRole,
  isNetworkError,
  STAFF_PROFILE_ROLES,
  SUPER_ADMIN_PROFILE_ROLES,
} from "@/lib/roles";

/**
 * The coarse "is this a staff account?" gate. It must agree with
 * `public.is_staff_or_admin()` in SQL — that helper backs every `*_admin_all`
 * RLS policy, so a client list WIDER than the SQL grants chrome the server
 * refuses, and one NARROWER locks a real staff member out of their own console
 * (which is exactly what the legacy `admin` role used to do).
 *
 * `scripts/verify-role-vocabulary.mjs` compares the two lists mechanically.
 * These tests pin the behaviour: the fail-closed cases are what matter when a
 * new enum value is added to the database.
 */

const NON_STAFF = ["customer", "supplier", "anonymous", "anon", "guest"] as const;

describe("isStaffRole", () => {
  it.each(STAFF_PROFILE_ROLES)("grants staff chrome to %s", (role) => {
    expect(isStaffRole(role)).toBe(true);
  });

  it.each(NON_STAFF)("refuses %s", (role) => {
    expect(isStaffRole(role)).toBe(false);
  });

  it("fails closed for a role the app has never heard of", () => {
    // The real hazard: someone adds `finance_manager` to the SQL enum and widens
    // the client list to match without widening the policies.
    expect(isStaffRole("finance_manager")).toBe(false);
    expect(isStaffRole("SUPER_ADMIN")).toBe(false); // role comparison is exact
    expect(isStaffRole("")).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });

  it("accepts the legacy admin role, which is why it exists", () => {
    // A legacy `admin` profile passed the database policies but was signed back
    // out of /admin, which reads to the operator as "Mission Control is broken".
    expect(isStaffRole("admin")).toBe(true);
  });
});

describe("isSuperAdminRole", () => {
  it("only recognises the owner role", () => {
    expect(SUPER_ADMIN_PROFILE_ROLES).toEqual(["super_admin"]);
    expect(isSuperAdminRole("super_admin")).toBe(true);
  });

  it("does not hand owner powers to plain staff", () => {
    for (const role of STAFF_PROFILE_ROLES.filter((r) => r !== "super_admin")) {
      expect(isSuperAdminRole(role)).toBe(false);
    }
    expect(isSuperAdminRole(null)).toBe(false);
    expect(isSuperAdminRole(undefined)).toBe(false);
  });
});

describe("list invariants", () => {
  it("the super-admin list is a subset of the staff list", () => {
    for (const role of SUPER_ADMIN_PROFILE_ROLES) {
      expect(STAFF_PROFILE_ROLES as readonly string[]).toContain(role);
    }
  });

  it("no explicitly-non-staff role is also treated as staff", () => {
    for (const role of NON_STAFF) {
      expect((STAFF_PROFILE_ROLES as readonly string[]).includes(role)).toBe(false);
    }
  });
});

describe("isNetworkError", () => {
  it("recognises the transport shapes supabase-js produces", () => {
    for (const message of [
      "Failed to fetch",
      "Network request failed",
      "NetworkError when attempting to fetch resource.",
      "getaddrinfo ENOTFOUND project.supabase.co",
      "connect ECONNREFUSED 127.0.0.1:5432",
      "request timed out",
      "The operation was aborted",
      "Service Unreachable",
    ]) {
      expect(isNetworkError({ message }), message).toBe(true);
    }
  });

  it("does not mistake a database answer for a network failure", () => {
    // A Postgres answer carries a code; treating it as transport is how
    // "no permission" gets drawn as "you are offline".
    expect(
      isNetworkError({ code: "42501", message: "permission denied for table orders" })
    ).toBe(false);
    expect(
      isNetworkError({ code: "PGRST116", message: "JSON object requested, multiple rows returned" })
    ).toBe(false);
    expect(isNetworkError({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(isNetworkError({ code: "42703", message: 'column "fees" does not exist' })).toBe(false);
  });

  it("treats null/undefined/primitives as no evidence of a transport failure", () => {
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError(42)).toBe(false);
  });
});
