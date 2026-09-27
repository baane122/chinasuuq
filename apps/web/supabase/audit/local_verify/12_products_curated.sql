-- Post-migration fixture writes. run.sh loads this AFTER the migrations, because
-- every column named here is created by one:
--   moq_source / moq_confidence / moq_raw_text  → 202609250003
--
-- WHY A SEPARATE FILE: 00_common.sql is a faithful mirror of the base catalog
-- table (202408010004) and must not name a column that only a later migration
-- adds — that is precisely how the harness came to print PASS for a schema that
-- does not exist. So the provenance the other suites expect is written here,
-- once the ALTERs have run.
--
-- A direct UPDATE rather than record_moq_candidate(): the RPC is service_role
-- only by design and 70_moq_gate.sql tests it in isolation. This file only has
-- to place a row in a state a machine could legitimately have left it in.
UPDATE public.source_products
   SET moq_source     = 'regex',
       moq_confidence = 0.850,
       moq_raw_text   = '一件代发 10件起批'
 WHERE id = 'f0000000-0000-4000-8000-000000000001';
