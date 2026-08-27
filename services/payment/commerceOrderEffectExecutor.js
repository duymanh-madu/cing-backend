const supabase = require("../../supabase");

const DEFAULT_LEASE_SECONDS = 120;

function authorityError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function rpc(name, args) {
  const { data, error } =
    await supabase.rpc(name, args);

  if (error) {
    throw authorityError(
      "COMMERCE_ORDER_EFFECT_AUTHORITY_FAILED",
      `${name}: ${error.message}`
    );
  }

  return data;
}

function firstRow(data) {
  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}

async function executeCommerceOrderEffect({
  orderId,
  effectKey,
  execute,
  leaseSeconds = DEFAULT_LEASE_SECONDS,
}) {
  if (!orderId) {
    throw authorityError(
      "COMMERCE_ORDER_EFFECT_ORDER_ID_REQUIRED"
    );
  }

  if (
    !effectKey ||
    typeof effectKey !== "string"
  ) {
    throw authorityError(
      "COMMERCE_ORDER_EFFECT_KEY_REQUIRED"
    );
  }

  if (typeof execute !== "function") {
    throw authorityError(
      "COMMERCE_ORDER_EFFECT_EXECUTOR_REQUIRED"
    );
  }

  await rpc(
    "cing_commerce_ensure_order_effect_v1",
    {
      p_order_id: orderId,
      p_effect_key: effectKey,
    }
  );

  const claim = firstRow(
    await rpc(
      "cing_commerce_claim_order_effect_v1",
      {
        p_order_id: orderId,
        p_effect_key: effectKey,
        p_lease_seconds: leaseSeconds,
      }
    )
  );

  if (!claim) {
    throw authorityError(
      "COMMERCE_ORDER_EFFECT_CLAIM_EMPTY"
    );
  }

  /*
   * The PostgreSQL claim RPC is the sole lease-ownership authority.
   *
   * IMPORTANT:
   * an already-processing effect may legitimately return the current
   * row including its claim_token, while acquired=false. Therefore
   * token presence MUST NOT be interpreted as ownership.
   */
  if (claim.status === "completed") {
    return {
      success: true,
      executed: false,
      skipped: true,
      reason: "completed",
      effect: claim,
    };
  }

  if (claim.acquired !== true) {
    return {
      success: true,
      executed: false,
      skipped: true,
      reason: "not_acquired",
      effect: claim,
    };
  }

  if (
    claim.status !== "processing" ||
    !claim.claim_token
  ) {
    throw authorityError(
      "COMMERCE_ORDER_EFFECT_CLAIM_CONTRACT_INVALID"
    );
  }

  const claimToken =
    claim.claim_token;

  try {
    const result =
      await execute({
        orderId,
        effectKey,
        claimToken,
        effect: claim,
      });

    const completed = firstRow(
      await rpc(
        "cing_commerce_complete_order_effect_v1",
        {
          p_order_id: orderId,
          p_effect_key: effectKey,
          p_claim_token: claimToken,
        }
      )
    );

    return {
      success: true,
      executed: true,
      skipped: false,
      result,
      effect: completed,
    };
  } catch (error) {
    try {
      await rpc(
        "cing_commerce_fail_order_effect_v1",
        {
          p_order_id: orderId,
          p_effect_key: effectKey,
          p_claim_token: claimToken,
          p_error:
            String(
              error?.message ||
              error ||
              "UNKNOWN_ORDER_EFFECT_ERROR"
            ).slice(0, 2000),
        }
      );
    } catch (failError) {
      /*
       * Preserve the original business-effect failure while attaching
       * the authority failure for observability.
       */
      error.effectAuthorityFailure =
        failError;
    }

    throw error;
  }
}

module.exports = {
  DEFAULT_LEASE_SECONDS,
  executeCommerceOrderEffect,
};
