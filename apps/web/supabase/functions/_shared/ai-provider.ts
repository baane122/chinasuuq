// Shared AI provider access for ChinaSuuq Edge Functions.
//
// Two responsibilities:
//   1. load the provider credential from ai_provider_config, the table that
//      replaced the anonymously-readable settings/'ai_provider' row;
//   2. vet the base_url before any server-side fetch.
//
// The previous guard lived inline in ai-extraction and only tested for an
// internal host AFTER an '@' (userinfo), so https://169.254.169.254/ — the cloud
// metadata endpoint — sailed through. These checks are hostname-based, which
// covers IP literals, and every function now calls the same code.

export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  isConfigured: boolean;
}

/**
 * Returns an error string when the URL must not be fetched server-side, or null
 * when it is acceptable. https-only, public hosts only.
 */
export function validateProviderBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "base_url_malformed";
  }
  if (url.protocol !== "https:") return "base_url_must_be_https";
  if (url.username || url.password) return "base_url_userinfo_not_allowed";
  if (url.port && url.port !== "443") return "base_url_port_not_allowed";

  // Strip IPv6 brackets: URL.hostname keeps them, and DENO prints "[::1]".
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (!host) return "base_url_host_missing";
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return "base_url_host_not_allowed";
  }

  // IPv4 literal (also catches decimal/octal/hex forms by requiring dotted quad).
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((p) => p > 255)) return "base_url_host_not_allowed";
    const [a, b] = parts;
    const isPrivate =
      a === 0 ||                    // 0.0.0.0/8
      a === 10 ||                   // private
      a === 127 ||                  // loopback
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) ||   // link-local incl. 169.254.169.254 metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224;                     // multicast + reserved
    if (isPrivate) return "base_url_host_not_allowed";
  }

  // IPv6: loopback, unspecified, unique-local, link-local, and v4-mapped.
  if (host.includes(":")) {
    if (
      host === "::1" ||
      host === "::" ||
      host.startsWith("fc") || host.startsWith("fd") || // unique local
      host.startsWith("fe80") ||                        // link local
      host.startsWith("::ffff:") ||                     // v4-mapped
      /^::\d/.test(host)
    ) return "base_url_host_not_allowed";
  }

  return null;
}

/**
 * Read the service_role client's view of the provider config.
 * `client` must be a service-role Supabase client — anon/authenticated have no
 * grants on ai_provider_config.
 */
export async function loadAiProviderConfig(client: {
  from: (t: string) => {
    select: (c: string) => { eq: (c: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown }> } };
  };
}): Promise<AiProviderConfig | null> {
  const { data } = await client
    .from("ai_provider_config")
    .select("base_url, api_key, model, is_configured")
    .eq("id", 1)
    .maybeSingle();

  const row = (data ?? {}) as Record<string, unknown>;
  const baseUrl = String(row.base_url || "").replace(/\/+$/, "");
  const apiKey = String(row.api_key || "");
  const model = String(row.model || "");
  const isConfigured = Boolean(row.is_configured);

  if (!isConfigured || !baseUrl || !apiKey || !model) return null;
  if (validateProviderBaseUrl(baseUrl)) return null;

  return { baseUrl, apiKey, model, isConfigured };
}

/**
 * Per-task provider resolution: read the task's row from ai_provider_tasks,
 * fall back to the global ai_provider_config when the task is unconfigured.
 *
 * Task → fallback mapping keeps behavior identical for existing deployments:
 *   translation/extraction → global config (what ai-translate/ai-extraction
 *                            already used via loadAiProviderConfig)
 *   vision                 → global config
 *   copilot                → global config
 * `client` must be a service-role client (both tables deny anon/authenticated).
 */
export type AiTask = "copilot" | "translation" | "vision" | "extraction";

export async function loadAiProviderForTask(
  client: {
    from: (t: string) => {
      select: (c: string) => { eq: (c: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown }> } };
    };
  },
  task: AiTask
): Promise<AiProviderConfig | null> {
  // 1. Task-specific override (a missing table is tolerated: pre-migration
  //    deployments behave exactly as before).
  const { data } = await client
    .from("ai_provider_tasks")
    .select("base_url, api_key, model, is_configured")
    .eq("task", task)
    .maybeSingle();

  const row = (data ?? {}) as Record<string, unknown>;
  const baseUrl = String(row.base_url || "").replace(/\/+$/, "");
  const apiKey = String(row.api_key || "");
  const model = String(row.model || "");

  if (row.is_configured && baseUrl && apiKey && model && !validateProviderBaseUrl(baseUrl)) {
    return { baseUrl, apiKey, model, isConfigured: true };
  }

  // 2. Fall back to the global provider.
  return loadAiProviderConfig(client);
}
