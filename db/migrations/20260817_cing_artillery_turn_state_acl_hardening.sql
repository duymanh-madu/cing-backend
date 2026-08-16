BEGIN;

-- =====================================================
-- CING ARTILLERY — TURN STATE ACL HARDENING
--
-- Root cause:
--
-- cing_artillery_turn_states historically retained direct
-- table privileges for Supabase application roles.
--
-- service_role has BYPASSRLS in production, therefore a
-- direct UPDATE/INSERT/DELETE/TRUNCATE grant would bypass
-- the fenced PostgreSQL gameplay authorities entirely.
--
-- Canonical mutation authority already exists through:
--
--   cing_artillery_get_or_create_turn_state_atomic
--     SECURITY DEFINER / postgres-owned
--
--   cing_artillery_activate_first_turn_atomic
--     SECURITY DEFINER / postgres-owned
--
--   cing_artillery_accept_shot_command_atomic
--     SECURITY DEFINER / postgres-owned
--     reads/locks turn authority while accepting a shot
--
--   cing_artillery_advance_turn_private
--     postgres-internal private primitive only
--
-- Therefore no application role requires direct mutation
-- privileges on cing_artillery_turn_states.
--
-- Desired boundary:
--
--   anon             no direct table access
--   authenticated    no direct table access
--   service_role     SELECT only
--   postgres         owner authority
--
-- This migration changes ACL only.
--
-- It does NOT:
--
--   mutate gameplay rows
--   change RLS policies
--   change turn lifecycle logic
--   alter RPC definitions
--   alter function ACLs
--   expose private Turn Advancement
-- =====================================================


REVOKE ALL
ON TABLE
  public.cing_artillery_turn_states
FROM PUBLIC;

REVOKE ALL
ON TABLE
  public.cing_artillery_turn_states
FROM anon;

REVOKE ALL
ON TABLE
  public.cing_artillery_turn_states
FROM authenticated;

REVOKE ALL
ON TABLE
  public.cing_artillery_turn_states
FROM service_role;


-- Backend application may inspect canonical current-turn
-- state, but all mutation remains PostgreSQL-RPC owned.

GRANT SELECT
ON TABLE
  public.cing_artillery_turn_states
TO service_role;


COMMIT;
