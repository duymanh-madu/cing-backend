"use strict";

const supabase = require("../../supabase");
const {
  normalizePhone,
} = require("../../utils/phoneIdentity");

function failure(code, message, statusCode, cause) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

function quantityOf(value) {
  const quantity =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          /^[0-9]+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;

  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 2147483647
  ) {
    throw failure(
      "REVIVE_PURCHASE_QUANTITY_INVALID",
      "Số Revive Credit không hợp lệ",
      400
    );
  }

  return quantity;
}

function requestIdOf(value) {
  const id =
    typeof value === "string"
      ? value.trim().toLowerCase()
      : "";

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
  ) {
    throw failure(
      "REVIVE_PURCHASE_REQUEST_ID_INVALID",
      "Mã yêu cầu mua Revive Credit không hợp lệ",
      400
    );
  }

  return id;
}

function mapRpcFailure(rpcError) {
  const message = String(rpcError?.message || "");

  const mappings = [
    [
      "REVIVE_PURCHASE_PRICE_NOT_CONFIGURED",
      503,
      "Tính năng mua Revive Credit chưa được mở",
    ],
    [
      "CING_WALLET_INSUFFICIENT_BALANCE",
      409,
      "Số dư Cing Wallet không đủ",
    ],
    [
      "REVIVE_PURCHASE_REPLAY_CONFLICT",
      409,
      "Mã yêu cầu đã được sử dụng cho giao dịch khác",
    ],
    [
      "REVIVE_PURCHASE_QUANTITY_INVALID",
      400,
      "Số Revive Credit không hợp lệ",
    ],
    [
      "REVIVE_PURCHASE_COST_OVERFLOW",
      400,
      "Số lượng mua vượt giới hạn",
    ],
    [
      "REVIVE_PURCHASE_PLAYER_NOT_FOUND",
      404,
      "Không tìm thấy tài khoản thành viên",
    ],
    [
      "CING_WALLET_USER_NOT_FOUND",
      404,
      "Không tìm thấy tài khoản thành viên",
    ],
  ];

  for (const [code, status, publicMessage] of mappings) {
    if (message.includes(code)) {
      return failure(
        code,
        publicMessage,
        status,
        rpcError
      );
    }
  }

  return failure(
    "REVIVE_PURCHASE_FAILED",
    "Không thể mua Revive Credit lúc này",
    500,
    rpcError
  );
}

async function buyReviveCreditsWithWallet({
  customer,
  quantity,
  requestId,
}) {
  const userId = normalizePhone(
    customer?.phone || ""
  );

  if (!userId) {
    throw failure(
      "REVIVE_PURCHASE_MEMBER_IDENTITY_REQUIRED",
      "Không xác định được tài khoản thành viên",
      401
    );
  }

  const normalizedQuantity =
    quantityOf(quantity);

  const normalizedRequestId =
    requestIdOf(requestId);

  const { data, error } = await supabase.rpc(
    "cing_wallet_purchase_revive_credits_v1",
    {
      p_user_id: userId,
      p_quantity: normalizedQuantity,
      p_request_id: normalizedRequestId,
    }
  );

  if (error) {
    throw mapRpcFailure(error);
  }

  const result = Array.isArray(data)
    ? data[0]
    : null;

  if (
    !result ||
    typeof result.applied !== "boolean" ||
    String(result.request_id).toLowerCase() !==
      normalizedRequestId ||
    !result.wallet_transaction_id ||
    result.credit_transaction_id == null ||
    result.quantity !== normalizedQuantity ||
    result.unit_price == null ||
    result.total_cost == null ||
    result.wallet_balance_after == null ||
    result.credit_balance_after == null
  ) {
    throw failure(
      "REVIVE_PURCHASE_RESPONSE_INVALID",
      "Chưa xác minh được kết quả mua Revive Credit",
      502
    );
  }

  return {
    applied: result.applied,
    request_id: result.request_id,
    wallet_transaction_id:
      result.wallet_transaction_id,
    credit_transaction_id:
      result.credit_transaction_id,
    quantity: result.quantity,
    unit_price: result.unit_price,
    total_cost: result.total_cost,
    wallet_balance_after:
      result.wallet_balance_after,
    credit_balance_after:
      result.credit_balance_after,
  };
}

module.exports = {
  buyReviveCreditsWithWallet,
};
