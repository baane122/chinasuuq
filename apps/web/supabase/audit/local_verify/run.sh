#!/usr/bin/env bash
# Local regression harness for the 2026-09-24 admin migrations.
#
# WHY THIS EXISTS: the repo cannot prove which `orders` schema generation is
# live (three incompatible shapes exist across the migration history) and this
# workspace has no network access to the Supabase project. So instead of
# guessing, the rollup functions read every field through to_jsonb() and this
# harness proves them against four physical schemas.
#
# It needs a scratch Postgres. Nothing here touches the repo's real database.
#
#   initdb -D /tmp/cs_pg_audit/data -U postgres --auth=trust
#   pg_ctl -D /tmp/cs_pg_audit/data -o "-p 55432 -k /tmp/cs_pg_audit" -l /tmp/cs_pg_audit/log start
#   PGHOST=/tmp/cs_pg_audit PGPORT=55432 PSQL=psql ./run.sh
#
# Expect, per generation: the rollup suite verdict, the provenance suite verdict,
# the three metric read-backs, the catalog-column contract, the access-control
# negatives, the view-write negatives, the trending verdict, and the MOQ-gate
# verdicts. Anything that is not a PASS line is a bug.
set -u

here="$(cd "$(dirname "$0")" && pwd)"
MIG="$(cd "$here/../../migrations" && pwd)"
PSQL="${PSQL:-psql}"
PGPORT="${PGPORT:-55432}"
DB=cs_verify
STAFF=00000000-0000-0000-0000-00000000000c

psql_q() { $PSQL -p "$PGPORT" "$@"; }

run_gen() {
  gen="$1"
  psql_q -q -U postgres -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1
  psql_q -q -U postgres -d postgres -c "CREATE DATABASE $DB" >/dev/null || { echo "!! cannot create $DB"; exit 1; }
  echo "───────────────── generation: $gen ─────────────────"
  psql_q -q -v ON_ERROR_STOP=0 -U postgres -d $DB \
    -f "$here/00_common.sql" -f "$here/10_${gen}.sql" \
    -f "$MIG/202609240002_ai_secret_containment.sql" \
    -f "$MIG/202609240003_admin_rollups.sql" \
    -f "$MIG/202609240004_order_item_provenance.sql" \
    -f "$MIG/202609250001_translation_cache.sql" \
    -f "$MIG/202609250002_trending_products.sql" \
    -f "$MIG/202609250003_moq_extraction.sql" \
    -f "$MIG/202609250004_catalog_display_columns.sql" \
    -f "$MIG/202609250005_live_catalog_columns.sql" \
    -c "SELECT set_config('cs.generation','$gen',false)" \
    -c "SELECT set_config('request.jwt.claim.sub','$STAFF',false)" \
    -c "SELECT public.seed_fixture()" -c "SELECT public.seed_orders()" \
    -f "$here/12_products_curated.sql" \
    -f "$here/20_suite.sql" -f "$here/40_provenance.sql" 2>&1 | grep -E "NOTICE|ERROR"

  psql_q -q -A -t -F '' -U postgres -d $DB \
    -c "SELECT set_config('request.jwt.claim.sub','$STAFF',false)" \
    -c "SELECT '  breakdown: '||string_agg(marketplace||'='||revenue, ', ' ORDER BY marketplace) FROM admin_revenue_by_marketplace(90)" \
    -c "SELECT '  daily(7): '||count(*)||' rows, revenue '||coalesce(sum(revenue),0)||', orders '||coalesce(sum(orders),0) FROM admin_revenue_daily(7)" \
    -c "SELECT '  kpi rows: '||count(*) FROM admin_kpis()" 2>&1 | grep -E "^  (breakdown|daily|kpi)"

  # 80 first: it rolls back every write it makes, and its admin_kpis() baselines
  # count the seed catalog, which 60_trending.sql then adds an active row to.
  psql_q -q -v ON_ERROR_STOP=0 -U postgres -d $DB -v MIG="$MIG" \
    -c "SELECT set_config('cs.generation','$gen',false)" \
    -f "$here/80_catalog_contract.sql" \
    -f "$here/30_access.sql" -f "$here/50_view_writes.sql" -f "$here/60_trending.sql" \
    -f "$here/70_moq_gate.sql" -f "$here/90_live_shape.sql" \
    -f "$here/91_live_order_items.sql" 2>&1 | grep -E "PASS|FAIL"
}

for g in g1_mobile g2_legacy g3_minimal g4_hybrid; do run_gen "$g"; done

# 92 recreates production's orders/order_items with plain CREATE TABLE, so it
# needs a database of its own — the per-generation cs_verify already carries an
# order_items from 00_common.sql, and the whole point of 92 is that it does NOT
# inherit the generation's guessed shape.
run_submit() {
  psql_q -q -U postgres -d postgres -c "DROP DATABASE IF EXISTS cs_submit" >/dev/null 2>&1
  psql_q -q -U postgres -d postgres -c "CREATE DATABASE cs_submit" >/dev/null || { echo "!! cannot create cs_submit"; exit 1; }
  echo "───────────────── mobile order submit (production shape) ─────────────────"
  psql_q -q -v ON_ERROR_STOP=0 -U postgres -d cs_submit -v MIG="$MIG" \
    -f "$here/92_mobile_order_submit.sql" 2>&1 | grep -E "PASS|FAIL|ERROR"
}

run_submit
