-- ============================================================
-- ChinaSuuq — `image` AI task (product photo generation)
-- 2026-11-01
--
-- WHY. Product photos are the single biggest catalog gap: the marketplace CDNs
-- 1688/Taobao serve expire and refuse foreign referers, so cards fall back to a
-- placeholder. Mission Control needs a way to generate a clean, marketplace-free
-- studio photo for a listing whose own photos are broken — through the SAME
-- admin-configured provider every other AI feature already uses.
--
-- The task list is a CHECK constraint on a live table. Adding a task means
-- widening that constraint; without this migration the ai-settings function
-- answers `23514` when staff try to point Image at a model, and the AI photo
-- button reports "not configured" forever.
--
-- Safe to re-run: the constraint is dropped and re-added, and no row is written.
-- ============================================================

BEGIN;

ALTER TABLE public.ai_provider_tasks
  DROP CONSTRAINT IF EXISTS ai_provider_tasks_task_check;

ALTER TABLE public.ai_provider_tasks
  ADD CONSTRAINT ai_provider_tasks_task_check
  CHECK (task IN ('copilot', 'translation', 'vision', 'extraction', 'image'));

COMMENT ON COLUMN public.ai_provider_tasks.task IS
 'AI workload that resolves its own provider: copilot (chat), translation (unused, Google gtx from the device), vision (screenshot reading), extraction (structured JSON + product copy), image (product photo generation). Unconfigured tasks fall back to the global row.';

COMMIT;

-- ============================================================
-- VERIFY (SQL editor as project owner):
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.ai_provider_tasks'::regclass;
--   -- expect a check that lists 'image'
-- ============================================================
