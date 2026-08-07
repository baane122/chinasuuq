// ============================================================
// @chinasuuq/shared
// Single entry point for all shared code.
// ============================================================

// ── Types & Constants ───────────────────────────────────────
export * from "./types";
export * from "./constants";

// ── Utilities ───────────────────────────────────────────────
export * from "./utils";

// ── Validation (Zod Schemas) ────────────────────────────────
export * from "./validation";

// ── Error Handling ──────────────────────────────────────────
export * from "./errors";

// ── API Client ──────────────────────────────────────────────
export * from "./api-client";

// NOTE: hooks.ts exports React hooks and is NOT re-exported here
// because it has a peer dependency on `react`.
// Import hooks directly: import { useDebounce } from "@chinasuuq/shared/hooks";
