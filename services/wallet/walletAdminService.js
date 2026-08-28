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

module.exports = {
  getTopupPromotion,
  configureTopupPromotion,
  getWalletSummary,
};
