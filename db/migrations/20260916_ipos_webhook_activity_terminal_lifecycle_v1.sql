/*
 * CING IPOS WEBHOOK ACTIVITY TERMINAL LIFECYCLE V1
 *
 * synced=true
 *   = CRM activity successfully acknowledged.
 *
 * synced=false AND terminal_at IS NULL
 *   = retryable pending activity.
 *
 * synced=false AND terminal_at IS NOT NULL
 *   = terminal non-retryable activity.
 *
 * terminal lifecycle must never be used as a substitute
 * for a successful CRM acknowledgement.
 */

alter table public.ipos_webhook_log
add column if not exists terminal_at timestamptz;

alter table public.ipos_webhook_log
add column if not exists terminal_reason text;

/*
 * Historical rows created before the webhook identity gate may contain
 * non-phone iPOS identities. Classify those rows as terminal without
 * fabricating CRM success.
 *
 * Keep the predicate aligned with the application customer-phone
 * contract and do not hardcode any historical identifier.
 */
update public.ipos_webhook_log
set
  terminal_at = now(),
  terminal_reason = 'non_phone_identity'
where synced = false
  and terminal_at is null
  and phone is not null
  and phone !~ '^(0|84)[0-9]{8,10}$';

/*
 * Worker/health primarily scan retryable pending activity.
 */
create index if not exists
ipos_webhook_log_retryable_pending_idx
on public.ipos_webhook_log (
  received_at,
  id
)
where synced = false
  and terminal_at is null
  and phone is not null;
