-- Access-control negatives. Run as a separate psql invocation: SET ROLE cannot be
-- undone inside a DO block and the caller claim has to change with it.

-- (a) anon must not even hold EXECUTE (the migration revokes it)
SET ROLE anon;
DO $$ BEGIN
    IF has_function_privilege('anon', 'public.admin_kpis()', 'EXECUTE') THEN
        RAISE NOTICE 'FAIL [%] anon still holds EXECUTE on admin_kpis()', current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'PASS [%] anon has no EXECUTE on admin_kpis()', current_setting('cs.generation', true);
    END IF;
END $$;
RESET ROLE;

-- (b) an authenticated CUSTOMER may hold EXECUTE (so the RPC is reachable from the
-- app) but the function must refuse to report global revenue to them.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
DO $$ BEGIN
    PERFORM 1 FROM admin_kpis();
    RAISE NOTICE 'FAIL [%] a customer session was allowed to read global revenue', current_setting('cs.generation', true);
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%staff or super_admin%' THEN
        RAISE NOTICE 'PASS [%] customer refused by the access gate', current_setting('cs.generation', true);
    ELSE
        RAISE NOTICE 'FAIL [%] customer call failed for the wrong reason: %', current_setting('cs.generation', true), SQLERRM;
    END IF;
END $$;
