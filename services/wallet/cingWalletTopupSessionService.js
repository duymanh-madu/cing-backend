const supabase =
  require("../../supabase");

const {
  normalizePhone,
} = require(
  "../../utils/phoneIdentity"
);

const {
  createPaymentSession,
} = require(
  "../payment/paymentOrchestratorService"
);


/*
 * =====================================================
 * CING WALLET — TOP-UP SESSION AUTHORITY V1
 * =====================================================
 *
 * Authority boundary:
 *
 * - authenticated customer is resolved by authMiddleware
 * - canonical Wallet identity is customer.phone -> players.user_id
 * - caller supplies only the requested top-up amount
 * - payment purpose is hard-bound to wallet_topup
 * - provider is hard-bound to MoMo in V1
 * - payment method is hard-bound to MoMo in V1
 * - no caller-controlled order/cart/payment authority is accepted
 */


function createWalletTopupError({
  message,
  code,
  statusCode,
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}


function normalizeTopupAmount(
  value
) {
  /*
   * VND is integer money.
   *
   * Accept:
   * - JSON integer number
   * - decimal digit string
   *
   * Reject:
   * - fractional values
   * - exponent notation
   * - signs
   * - whitespace-only values
   * - unsafe JS integers
   * - zero / negative values
   */
  let amount;

  if (
    typeof value ===
    "number"
  ) {
    amount =
      value;
  } else if (
    typeof value ===
      "string" &&
    /^[0-9]+$/.test(
      value.trim()
    )
  ) {
    amount =
      Number(
        value.trim()
      );
  } else {
    throw createWalletTopupError({
      message:
        "Số tiền nạp không hợp lệ",
      code:
        "CING_WALLET_TOPUP_AMOUNT_INVALID",
      statusCode:
        400,
    });
  }

  if (
    !Number.isSafeInteger(
      amount
    ) ||
    amount <= 0
  ) {
    throw createWalletTopupError({
      message:
        "Số tiền nạp không hợp lệ",
      code:
        "CING_WALLET_TOPUP_AMOUNT_INVALID",
      statusCode:
        400,
    });
  }

  return amount;
}


function resolveWalletUserId(
  customer
) {
  const userId =
    normalizePhone(
      customer?.phone || ""
    );

  if (!userId) {
    throw createWalletTopupError({
      message:
        "Không xác định được tài khoản thành viên",
      code:
        "CING_WALLET_MEMBER_IDENTITY_REQUIRED",
      statusCode:
        401,
    });
  }

  return userId;
}


async function assertWalletPlayerExists(
  userId
) {
  const {
    data,
    error,
  } = await supabase
    .from(
      "players"
    )
    .select(
      "user_id"
    )
    .eq(
      "user_id",
      userId
    )
    .maybeSingle();

  if (error) {
    throw createWalletTopupError({
      message:
        "Không thể xác thực tài khoản Cing Wallet",
      code:
        "CING_WALLET_PLAYER_LOOKUP_FAILED",
      statusCode:
        500,
    });
  }

  if (!data) {
    throw createWalletTopupError({
      message:
        "Tài khoản thành viên không tồn tại",
      code:
        "CING_WALLET_PLAYER_NOT_FOUND",
      statusCode:
        404,
    });
  }

  if (
    String(
      data.user_id || ""
    ) !==
    userId
  ) {
    throw createWalletTopupError({
      message:
        "Sai lệch định danh tài khoản Cing Wallet",
      code:
        "CING_WALLET_PLAYER_IDENTITY_MISMATCH",
      statusCode:
        500,
    });
  }
}


async function createWalletTopupSession({
  customer,
  amount,
}) {
  const userId =
    resolveWalletUserId(
      customer
    );

  const normalizedAmount =
    normalizeTopupAmount(
      amount
    );

  await assertWalletPlayerExists(
    userId
  );

  /*
   * Financial authority is intentionally hard-bound here.
   *
   * Never spread caller input into this payload.
   *
   * cart_snapshot is not an order cart. It contains only a
   * backend-owned purpose marker so downstream records remain
   * self-describing without inventing commerce/order data.
   */
  const paymentResult =
    await createPaymentSession({
      user_id:
        userId,

      payment_provider:
        "momo",

      payment_method:
        "momo",

      payment_purpose:
        "wallet_topup",

      total_amount:
        normalizedAmount,

      cart_snapshot: {
        purpose:
          "wallet_topup",
      },
    });

  return {
    amount:
      normalizedAmount,

    payment:
      paymentResult,
  };
}


module.exports = {
  normalizeTopupAmount,
  resolveWalletUserId,
  createWalletTopupSession,
};
