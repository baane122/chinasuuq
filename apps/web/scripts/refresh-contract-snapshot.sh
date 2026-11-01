#!/usr/bin/env bash
# Regenerate scripts/contract-snapshot.json from the LIVE database.
#
# verify:contract is only as good as this file: it is the repo's copy of what
# PostgREST actually exposes. Refresh it immediately after applying any
# migration that adds/renames a function, an argument or a table — otherwise the
# gate fails on correct code (or, worse, a stale snapshot keeps blessing a name
# that no longer exists in production, because nothing else reads live schema
# during a build).
#
# Usage, from apps/web:
#   DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
#     ./scripts/refresh-contract-snapshot.sh
#   (or: export PGPASSWORD=… and set DATABASE_URL without the password)
#
# Exit codes: 0 refreshed, 1 psql/unreachable, 2 no DATABASE_URL.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "refresh-contract-snapshot: DATABASE_URL is not set" >&2
  echo "  DATABASE_URL='postgresql://postgres.<ref>:<password>@…pooler.supabase.com:5432/postgres'" >&2
  exit 2
fi

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$here/contract-snapshot.json"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# Only INPUT parameters (proargmodes = 'i') are arguments PostgREST matches by
# name. A set-returning function also carries its OUT columns in proargnames, and
# treating those as arguments is what made an earlier version of this snapshot
# list `product_id, name, price_usd …` as "arguments" of fn_trending_products.
psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 >"$tmp" <<'SQL'
with f as (
  select p.proname,
         coalesce((
           select jsonb_agg(p.proargnames[ord] order by ord)
             from generate_subscripts(p.proargnames, 1) as ord
            where p.proargnames[ord] is not null
              and (p.proargmodes is null or p.proargmodes[ord] = 'i')
         ), '[]'::jsonb) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
)
select jsonb_pretty(jsonb_build_object(
  'project', current_setting('chinasuuq.project', true),
  'generated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD'),
  'rpcs', (select jsonb_object_agg(proname, args) from f),
  'relations', (
    select jsonb_agg(table_name order by table_name)
      from information_schema.tables
     where table_schema = 'public'
  )
));
SQL

node - "$tmp" "$out" <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");
const [, , from, to] = process.argv;
const snap = JSON.parse(readFileSync(from, "utf8"));
const ordered = {
  _comment:
    "Snapshot of the LIVE PostgREST surface (Supabase project athkmrvsaijwgsyvwrbp). " +
    "Regenerate with scripts/refresh-contract-snapshot.sh after any migration. " +
    "verify:contract fails when a client calls a function or relation that is not " +
    "listed here, or passes an argument name that is not an input parameter.",
  project: snap.project || "athkmrvsaijwgsyvwrbp",
  generated_at: snap.generated_at,
  rpcs: Object.fromEntries(Object.entries(snap.rpcs || {}).sort(([a], [b]) => a.localeCompare(b))),
  relations: [...(snap.relations || [])].sort(),
};
writeFileSync(to, JSON.stringify(ordered, null, 2) + "\n");
console.log(
  `contract-snapshot: ${Object.keys(ordered.rpcs).length} RPCs, ` +
    `${ordered.relations.length} relations, generated ${ordered.generated_at}`
);
NODE
