-- ============================================================
-- ChinaSuuq — Per-task AI provider configuration
-- 2026-10-01
--
-- Mission Control needs DIFFERENT providers per task: the copilot can run on
-- a premium model, translation on a cheap fast model, vision on an
-- image-capable model, extraction on a strict-JSON model — each potentially
-- from a DIFFERENT vendor (OpenAI, DeepSeek, Gemini proxy, ...).
--
-- ai_provider_config (id=1) stays as the GLOBAL default used when a task has
-- no row of its own. This table overrides per task. Same containment rules
-- as migration 202609240002: RLS on, NO policies, anon/authenticated have no
-- grants — only service_role (edge functions) can read the secrets.
--
-- Tasks (CHECK constraint): copilot | translation | vision | extraction
--   copilot     — admin AI Copilot chat (Mission Control /admin/ai)
--   translation — ai-translate edge function (listing/page translation)
--   vision      — image-understanding calls (AI Scan fallback)
--   extraction  — ai-extraction + product-enrich (structured JSON from text)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_provider_tasks (
    task          TEXT PRIMARY KEY CHECK (task IN ('copilot','translation','vision','extraction')),
    base_url      TEXT NOT NULL DEFAULT '',
    api_key       TEXT NOT NULL DEFAULT '',
    model         TEXT NOT NULL DEFAULT '',
    is_configured BOOLEAN NOT NULL DEFAULT false,
    updated_by    UUID,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_provider_tasks ENABLE ROW LEVEL SECURITY;

-- Secret containment: no anon/authenticated access at all, service_role only.
REVOKE ALL ON public.ai_provider_tasks FROM anon, authenticated, public;
GRANT ALL ON public.ai_provider_tasks TO service_role;

CREATE INDEX IF NOT EXISTS idx_ai_provider_tasks_configured
  ON public.ai_provider_tasks (task) WHERE is_configured;

-- ============================================================
-- VERIFY (service_role / SQL editor only — anon must get permission denied):
--   SELECT task, base_url, model, is_configured FROM public.ai_provider_tasks;
-- ============================================================
