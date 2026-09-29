/*
 * CING GAME CENTER V2
 * POINTS -> REVIVE CREDIT PURCHASE ACTIVATION V1
 *
 * Production activation authority only.
 *
 * Preconditions:
 * - cing_points_purchase_revive_credits_v1 exists;
 * - iPOS durable queue authority is installed;
 * - CRM snapshot protection is installed;
 * - CING_GAME_ECONOMY_V2_HTTP_ENABLED=true;
 * - CING_POINTS_REVIVE_IPOS_SYNC_WORKER_ENABLED=true.
 *
 * This migration grants backend-only invocation.
 * anon/authenticated remain denied.
 */

revoke all
on function public.cing_points_purchase_revive_credits_v1(
  text,
  integer,
  uuid
)
from public, anon, authenticated, service_role;

grant execute
on function public.cing_points_purchase_revive_credits_v1(
  text,
  integer,
  uuid
)
to service_role;
