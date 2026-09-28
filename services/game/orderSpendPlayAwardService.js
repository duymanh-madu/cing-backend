"use strict";

const supabase = require("../../supabase");
const { normalizePhone } = require("../../utils/phoneIdentity");

function normalizeOwner(value) {
  return normalizePhone(value || "");
}

async function resolveCanonicalCrmOrder({
  crm_order_id,
  user_id,
  order_code,
  amount,
} = {}) {
  const claimedUser = normalizeOwner(user_id);
  const orderCode = String(order_code || "").trim();
  const claimedAmount = Number(amount);

  let query = supabase
    .from("crm_orders")
    .select(
      "id, order_code, user_id, order_amount, source, processed, created_at"
    );

  const numericId = Number(crm_order_id);

  if (
    Number.isSafeInteger(numericId) &&
    numericId > 0
  ) {
    query = query.eq("id", numericId);
  } else {
    if (!orderCode) {
      return {
        ok: false,
        reason: "crm_order_identity_missing",
      };
    }

    /*
     * Production schema owns UNIQUE(order_code).
     */
    query = query.eq("order_code", orderCode);
  }

  const {
    data,
    error,
  } = await query.limit(2);

  if (error) {
    return {
      ok: false,
      reason: "crm_order_lookup_failed",
      detail: error.message,
    };
  }

  if (!Array.isArray(data) || data.length !== 1) {
    return {
      ok: false,
      reason:
        data?.length > 1
          ? "crm_order_identity_ambiguous"
          : "crm_order_missing",
    };
  }

  const row = data[0];
  const canonicalUser =
    normalizeOwner(row.user_id);

  if (
    claimedUser &&
    canonicalUser !== claimedUser
  ) {
    return {
      ok: false,
      reason: "crm_order_owner_mismatch",
      crm_order_id: row.id,
    };
  }

  if (
    Number.isSafeInteger(claimedAmount) &&
    claimedAmount > 0 &&
    Number(row.order_amount) !== claimedAmount
  ) {
    return {
      ok: false,
      reason: "crm_order_amount_mismatch",
      crm_order_id: row.id,
    };
  }

  return {
    ok: true,
    row,
    canonicalUser,
  };
}


async function reconcileCrmRewardQueue(
  batchSize = 20
) {
  const safeBatch =
    Number.isSafeInteger(Number(batchSize))
      ? Math.min(
          100,
          Math.max(1, Number(batchSize))
        )
      : 20;

  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_bridge_crm_revive_recover_batch_v1",
    {
      p_batch_size: safeBatch,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !Number.isSafeInteger(Number(data.checked))
  ) {
    throw new Error(
      "crm_revive_recovery_result_invalid"
    );
  }

  return data;
}


async function awardGamePlaysForOrderSpend({
  crm_order_id,
  user_id,
  order_code,
  amount,
  source_context = "order",
} = {}) {
  /*
   * Compatibility function name retained for existing callers.
   * Economic authority is now Revive Credit V2.
   */
  const resolved =
    await resolveCanonicalCrmOrder({
      crm_order_id,
      user_id,
      order_code,
      amount,
    });

  if (!resolved.ok) {
    return {
      success: false,
      review: true,
      reason: resolved.reason,
      detail: resolved.detail,
      crm_order_id:
        resolved.crm_order_id || null,
      order_code:
        String(order_code || "").trim(),
    };
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_bridge_crm_award_revive_v1",
    {
      p_crm_order_id: resolved.row.id,
    }
  );

  if (error) {
    return {
      success: false,
      review: true,
      reason: "crm_revive_bridge_rpc_failed",
      detail: error.message,
      crm_order_id: resolved.row.id,
      order_code: resolved.row.order_code,
    };
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return {
      success: false,
      review: true,
      reason: "crm_revive_bridge_result_invalid",
      crm_order_id: resolved.row.id,
      order_code: resolved.row.order_code,
    };
  }

  const status =
    String(data.status || "").trim();

  if (status === "deferred") {
    return {
      success: false,
      deferred: true,
      reason:
        data.reason ||
        "crm_revive_bridge_deferred",
      crm_order_id: resolved.row.id,
      order_code: resolved.row.order_code,
    };
  }

  if (status === "review_required") {
    return {
      success: false,
      review: true,
      reason:
        data.reason ||
        "crm_revive_review_required",
      crm_order_id: resolved.row.id,
      order_code: resolved.row.order_code,
    };
  }

  if (
    status === "skipped" ||
    status === "replayed"
  ) {
    /*
     * Batch authority owns durable delivery-state transition.
     * Run a bounded reconciliation attempt after the direct
     * idempotent resource-authority result.
     */
    try {
      await reconcileCrmRewardQueue(20);
    } catch (e) {
      console.warn(
        "[GAME V2] CRM reward queue reconcile failed:",
        e.message
      );
    }

    return {
      success: true,
      skipped: true,
      replayed: status === "replayed",
      reason:
        data.reason ||
        (
          status === "replayed"
            ? "already_awarded"
            : "below_threshold"
        ),
      credits:
        Number(data.credits || 0),
      crm_order_id: resolved.row.id,
      order_code: resolved.row.order_code,
    };
  }

  if (
    status !== "awarded" ||
    !Number.isSafeInteger(
      Number(data.credits)
    ) ||
    Number(data.credits) <= 0 ||
    !Number.isSafeInteger(
      Number(data.balance_after)
    )
  ) {
    return {
      success: false,
      review: true,
      reason:
        "crm_revive_bridge_result_invalid",
      crm_order_id: resolved.row.id,
      order_code: resolved.row.order_code,
    };
  }

  try {
    const {
      realtimeEventBus,
    } = require(
      "../realtime/realtimeEventBus"
    );

    realtimeEventBus.publish({
      event: "user.updated",
      delivery_type: "BROADCAST",
      payload: {
        phone: resolved.canonicalUser,
        data: {
          revive_credit_balance:
            Number(data.balance_after),
        },
      },
      channel: "membership",
      timestamp:
        new Date().toISOString(),
    });
  } catch (e) {
    console.warn(
      "[GAME V2] revive balance publish failed:",
      e.message
    );
  }

  /*
   * Resource award above is idempotent.
   * Batch RPC owns queue delivery status.
   */
  try {
    await reconcileCrmRewardQueue(20);
  } catch (e) {
    console.warn(
      "[GAME V2] CRM reward queue reconcile failed:",
      e.message
    );
  }

  console.log(
    "[GAME V2] CRM/iPOS Revive Credit award:",
    {
      user_id:
        resolved.canonicalUser,
      order_code:
        resolved.row.order_code,
      crm_order_id:
        resolved.row.id,
      credits:
        Number(data.credits),
      source_context,
    }
  );

  return {
    success: true,
    skipped: false,
    credits:
      Number(data.credits),
    balance_after:
      Number(data.balance_after),
    crm_order_id:
      resolved.row.id,
    user_id:
      resolved.canonicalUser,
    order_code:
      resolved.row.order_code,
  };
}


async function awardProcessedCrmIposOrdersForUser({
  user_id,
  page_size = 20,
} = {}) {
  /*
   * V1 scanned every historical crm_orders row for this user.
   *
   * V2 MUST NOT do that: pre-cutover CRM entitlements are
   * explicitly review-only. Durable delivery queue + Bridge
   * batch RPC are the only recovery admission.
   */
  const userId =
    normalizeOwner(user_id);

  if (!userId) {
    return {
      success: false,
      skipped: true,
      reason: "invalid_user",
    };
  }

  try {
    const stats =
      await reconcileCrmRewardQueue(
        page_size
      );

    const review =
      Number(stats.review || 0);

    return {
      success: review === 0,
      user_id: userId,
      checked:
        Number(stats.checked || 0),
      awarded:
        Number(stats.awarded || 0),
      replayed:
        Number(stats.replayed || 0),
      skipped:
        Number(stats.skipped || 0),
      deferred:
        Number(stats.deferred || 0),
      failed: review,
      review,
    };
  } catch (e) {
    return {
      success: false,
      user_id: userId,
      checked: 0,
      awarded: 0,
      replayed: 0,
      skipped: 0,
      deferred: 0,
      failed: 1,
      review: 0,
      error: e.message,
    };
  }
}


module.exports = {
  awardGamePlaysForOrderSpend,
  awardProcessedCrmIposOrdersForUser,
  reconcileCrmRewardQueue,
};
