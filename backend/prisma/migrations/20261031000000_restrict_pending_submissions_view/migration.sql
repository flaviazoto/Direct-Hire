-- public.pending_submissions (a production-only view, unused by the app,
-- which connects as postgres) lists applicants' emails. It runs with
-- security_invoker and row-level security already returns nothing to the
-- public API roles, but they have no reason to reach it at all. Recreating
-- it in 20261026000100 left Supabase's default grants on it; revoke them.
-- Idempotent; does nothing where the view does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'pending_submissions' AND relnamespace = 'public'::regnamespace) THEN
    REVOKE ALL ON public.pending_submissions FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.pending_submissions FROM anon; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.pending_submissions FROM authenticated; END IF;
  END IF;
END $$;
