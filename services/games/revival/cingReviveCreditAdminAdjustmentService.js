"use strict";

/*
 * CING GAME CENTER V2
 * Super Admin Revive Credit adjustment bridge.
 *
 * Validation/authorization is owned by the HTTP route.
 * PostgreSQL owns balance mutation and durable ledger.
 *
 * This service never updates balances directly.
 */

const supabase = require(
  "../../../supabase"
);

async function adjustReviveCredits(
  {
    user_id,
    amount,
    request_id,
    reason_code,
    note,
    reference_type,
    reference_id,
    actor_admin_id,
  },
  client = supabase
) {
  const { data, error } =
    await client.rpc(
      "cing_revive_credit_admin_adjust_v1",
      {
        p_user_id: user_id,
        p_amount: amount,
        p_request_id: request_id,
        p_reason_code: reason_code,
        p_note: note,
        p_reference_type: reference_type,
        p_reference_id: reference_id,
        p_actor_admin_id: actor_admin_id,
      }
    );

  if (error) {
    const wrapped =
      new Error(
        String(
          error.message ||
          "REVIVE_ADMIN_ADJUSTMENT_FAILED"
        )
      );

    wrapped.code =
      typeof error.code === "string"
        ? error.code
        : null;

    throw wrapped;
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  if (
    !row ||
    typeof row.applied !== "boolean" ||
    row.transaction_id == null ||
    !Number.isSafeInteger(
      Number(row.balance_after)
    ) ||
    Number(row.balance_after) < 0
  ) {
    throw new Error(
      "REVIVE_ADMIN_ADJUSTMENT_RESULT_INVALID"
    );
  }

  return {
    applied: row.applied,
    transaction_id:
      String(row.transaction_id),
    balance_after:
      Number(row.balance_after),
  };
}


/*
 * Historical read-only recovery: caller authorization is enforced in
 * adminReviveCreditRoutes and rechecked by PostgreSQL. An absent row
 * MUST NOT be interpreted as proof that an in-flight POST cannot commit.
 */
async function getReviveAdminAdjustmentStatus(
  { request_id, actor_admin_id },
  client = supabase
) {
  const { data, error } = await client.rpc(
    "cing_revive_admin_adjustment_status_v1",
    {
      p_request_id: request_id,
      p_actor_admin_id: actor_admin_id,
    }
  );
  if (error) {
    const wrapped = new Error(
      String(error.message || "REVIVE_ADMIN_STATUS_FAILED")
    );
    wrapped.code = typeof error.code === "string" ? error.code : null;
    throw wrapped;
  }
  if (!data || data.request_id !== request_id ||
      !["found", "not_found"].includes(data.status)) {
    throw new Error("REVIVE_ADMIN_STATUS_RESULT_INVALID");
  }
  if (data.status === "not_found") {
    return { status: "not_found", request_id };
  }
  if (typeof data.user_id !== "string" || !data.user_id ||
      !Number.isSafeInteger(data.amount) || data.amount === 0 ||
      !Number.isSafeInteger(data.balance_after) || data.balance_after < 0 ||
      typeof data.transaction_id !== "string" ||
      !/^[1-9][0-9]*$/.test(data.transaction_id) ||
      typeof data.created_at !== "string" ||
      Number.isNaN(Date.parse(data.created_at))) {
    throw new Error("REVIVE_ADMIN_STATUS_RESULT_INVALID");
  }
  return {
    status: "found",
    request_id,
    transaction_id: data.transaction_id,
    user_id: data.user_id,
    amount: data.amount,
    balance_after: data.balance_after,
    reason_code: data.reason_code,
    created_at: data.created_at,
  };
}

module.exports = {
  adjustReviveCredits,
  getReviveAdminAdjustmentStatus,
};
