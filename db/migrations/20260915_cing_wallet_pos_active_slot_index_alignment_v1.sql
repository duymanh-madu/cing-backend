/*
 * Cing Wallet POS — active payment slot index alignment V1
 *
 * Lifecycle authority now treats a paid manual/API POS session as
 * terminal financial/audit evidence and therefore non-blocking for
 * creation of the next transaction on the same POS.
 *
 * The existing physical partial unique index still included `paid`,
 * which contradicted cing_wallet_create_manual_pos_session_v2 and
 * could reject the next session with SQLSTATE 23505.
 *
 * Keep unfinished states fail-closed:
 *   amount_frozen
 *   qr_ready
 *   reconciliation_pending
 *
 * Keep paid history immutable but non-blocking.
 *
 * This migration changes only the partial unique index predicate.
 * It does not update/delete any POS session or payment intent and
 * has no Wallet, ledger, points, spending, rewards or Event11
 * mutation authority.
 */

drop index if exists
  public.cing_wallet_pos_sessions_active_payment_pos_uq;

create unique index
  cing_wallet_pos_sessions_active_payment_pos_uq
on public.cing_wallet_pos_sessions (
  pos_parent,
  pos_id
)
where
  session_origin in (
    'cashier_manual',
    'ipos_api'
  )
  and status in (
    'amount_frozen',
    'qr_ready',
    'reconciliation_pending'
  );
