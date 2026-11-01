import { describe, expect, it } from "vitest";
import { isTransportError } from "@/lib/track/errors";

/**
 * `/track` is public and probes a column shape, so three different things arrive
 * as "no row": a genuine miss, a schema mismatch, and a request that never got
 * an answer. The page used to draw all three as "Order not found", which tells a
 * customer holding a paid, shipped order that their order does not exist — and
 * sends them to WhatsApp support to argue about it.
 *
 * The rule: a Postgres/PostgREST answer always carries a `code`; pairing a
 * transport phrase with a code proves the phrase list, not the fallback.
 */
describe("isTransportError", () => {
  it.each([
    ["supabase-js TypeError", new TypeError("Failed to fetch")],
    ["fetch failed", { message: "fetch failed" }],
    ["RN network error", { message: "Network request failed" }],
    ["dns failure", { message: "getaddrinfo ENOTFOUND project.supabase.co" }],
    ["connection reset", { message: "read ECONNRESET" }],
    ["connection refused", { message: "connect ECONNREFUSED 10.0.0.1:5432" }],
    ["timeout", { message: "request timed out" }],
    ["abort", { name: "AbortError", message: "The operation was aborted" }],
    ["service unreachable", { message: "Service Unreachable" }],
    ["gateway HTML instead of JSON", { message: "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON" }],
  ])("treats %s as transport", (_label, err) => {
    expect(isTransportError(err)).toBe(true);
  });

  it.each([
    ["undefined_column", { code: "42703", message: 'column orders.fees does not exist' }],
    ["PGRST204", { code: "PGRST204", message: "Could not find the 'fees' column" }],
    ["PGRST116", { code: "PGRST116", message: "JSON object requested, multiple rows returned" }],
    ["permission denied", { code: "42501", message: "permission denied for table orders" }],
    ["rate limited", { code: "429", message: "Too Many Requests" }],
  ])("does NOT treat %s as transport (it is a real answer)", (_label, err) => {
    expect(isTransportError(err)).toBe(false);
  });

  it("treats an unrecognised error object as transport, which is the documented bias", () => {
    // Deliberate asymmetry, per src/lib/track/errors.ts: a wrong "we could not
    // connect, try again" costs one tap; a wrong "your order does not exist"
    // costs trust and a support ticket. An error with no code, details or hint is
    // therefore assumed to be transport.
    expect(isTransportError({})).toBe(true);
    expect(isTransportError({ message: "something a new engine invented" })).toBe(true);
  });

  it("treats no-error as no-transport-failure", () => {
    // `null`/`undefined` mean "nothing went wrong", not "the network died".
    expect(isTransportError(null)).toBe(false);
    expect(isTransportError(undefined)).toBe(false);
  });

  it("a transport phrase WITH a database code is still a database answer", () => {
    // The trap: `network` appears in messages produced by Postgres itself.
    expect(
      isTransportError({ code: "42501", message: "permission denied (network policy)" })
    ).toBe(false);
  });
});
