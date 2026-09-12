const supabase =
  require("../../supabase");

function assertRpcResult(
  error,
  operation
) {
  if (!error) {
    return;
  }

  const wrapped =
    new Error(
      error.message ||
      `CING_WALLET_${operation}_FAILED`
    );

  wrapped.code =
    error.code || null;

  wrapped.details =
    error.details || null;

  wrapped.hint =
    error.hint || null;

  throw wrapped;
}

async function getTopupPromotion() {
  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_wallet_get_topup_promotion_v1"
  );

  assertRpcResult(
    error,
    "PROMOTION_READ"
  );

  return data;
}

async function configureTopupPromotion({
  enabled,
  name,
  starts_at,
  ends_at,
  tiers,
  actor_id,
}) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_wallet_admin_configure_topup_promotion_v1",
    {
      p_enabled: enabled,
      p_name: name,
      p_starts_at: starts_at,
      p_ends_at: ends_at,
      p_tiers: tiers,
      p_actor_id: actor_id,
    }
  );

  assertRpcResult(
    error,
    "PROMOTION_CONFIGURE"
  );

  return data;
}

async function getWalletTransactions({
  limit,
  before_created_at,
  before_id,
  transaction_type,
}) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_wallet_admin_transactions_v1",
    {
      p_limit: limit,
      p_before_created_at:
        before_created_at,
      p_before_id:
        before_id,
      p_transaction_type:
        transaction_type,
    }
  );

  assertRpcResult(
    error,
    "LEDGER_READ"
  );

  return data;
}

async function getWalletSummary({
  from,
  to,
}) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_wallet_admin_summary_v1",
    {
      p_from: from,
      p_to: to,
    }
  );

  assertRpcResult(
    error,
    "SUMMARY_READ"
  );

  return data;
}


async function adjustWalletBalance({
  user_id,
  direction,
  amount,
  request_id,
  reason_code,
  note,
  reference_type,
  reference_id,
  actor_id,
}) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_wallet_admin_adjust_balance_atomic_v1",
    {
      p_user_id:
        user_id,
      p_direction:
        direction,
      p_amount:
        amount,
      p_request_id:
        request_id,
      p_reason_code:
        reason_code,
      p_note:
        note,
      p_reference_type:
        reference_type,
      p_reference_id:
        reference_id,
      p_actor_id:
        actor_id,
    }
  );

  assertRpcResult(
    error,
    "ADJUSTMENT"
  );

  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  if (!row) {
    const wrapped =
      new Error(
        "CING_WALLET_ADMIN_ADJUSTMENT_EMPTY"
      );
    wrapped.code =
      "CING_WALLET_ADMIN_ADJUSTMENT_EMPTY";
    throw wrapped;
  }

  return row;
}

module.exports = {
  getTopupPromotion,
  configureTopupPromotion,
  getWalletSummary,
  getWalletTransactions,
  adjustWalletBalance,
};
