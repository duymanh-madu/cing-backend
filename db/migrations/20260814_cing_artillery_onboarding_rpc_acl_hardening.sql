BEGIN;

-- =====================================================
-- CING ARTILLERY — ONBOARDING RPC ACL HARDENING
--
-- The onboarding RPC is server-side only.
--
-- PostgreSQL/Supabase may retain explicit EXECUTE grants
-- for anon/authenticated independently from PUBLIC.
--
-- Final authority:
--   PUBLIC        -> no EXECUTE
--   anon          -> no EXECUTE
--   authenticated -> no EXECUTE
--   service_role  -> EXECUTE
--
-- Existing applied migrations remain immutable.
-- =====================================================

REVOKE EXECUTE
ON FUNCTION
  public.onboard_cing_artillery_character_atomic(
    text,
    text,
    text
  )
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION
  public.onboard_cing_artillery_character_atomic(
    text,
    text,
    text
  )
FROM anon;

REVOKE EXECUTE
ON FUNCTION
  public.onboard_cing_artillery_character_atomic(
    text,
    text,
    text
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.onboard_cing_artillery_character_atomic(
    text,
    text,
    text
  )
TO service_role;

COMMIT;
