"use strict";

/*
 * CING GAME CENTER V2 — ECONOMY
 *
 * Points -> Revive Credit backend bridge.
 *
 * DORMANT:
 * - No HTTP route is mounted here.
 * - No production activation.
 * - PostgreSQL purchase RPC has no service_role
 *   EXECUTE grant until iPOS delivery and CRM snapshot
 *   protection are complete.
 */

const supabase =
  require("../../../supabase");

const {
  normalizePhone,
} = require(
  "../../../utils/phoneIdentity"
);

const MAX_INT =
  2147483647;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function failure(
  code,
  message,
  statusCode,
  cause
) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  if (cause) {
    error.cause =
      cause;
  }

  return error;
}

function quantityOf(value) {
  const quantity =
    typeof value === "number"
      ? value
      : (
          typeof value === "string" &&
          /^[0-9]+$/.test(value.trim())
        )
        ? Number(value.trim())
        : NaN;

  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_INT
  ) {
    throw failure(
      "POINTS_REVIVE_QUANTITY_INVALID",
      "Số Revive Credit không hợp lệ",
      400
    );
  }

  return quantity;
}

function requestIdOf(value) {
  const requestId =
    typeof value === "string"
      ? value.trim().toLowerCase()
      : "";

  if (
    !UUID_PATTERN.test(requestId)
  ) {
    throw failure(
      "POINTS_REVIVE_REQUEST_ID_INVALID",
      "Mã yêu cầu mua Revive Credit không hợp lệ",
      400
    );
  }

  return requestId;
}

function decimalInteger(
  value,
  field,
  {
    min = 0n,
    max = BigInt(
      Number.MAX_SAFE_INTEGER
    ),
  } = {}
) {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw failure(
      "POINTS_REVIVE_RESPONSE_INVALID",
      "Biên nhận mua Revive Credit không hợp lệ",
      502
    );
  }

  if (
    typeof value === "number" &&
    !Number.isSafeInteger(value)
  ) {
    throw failure(
      "POINTS_REVIVE_RESPONSE_INVALID",
      `${field} không phải số nguyên an toàn`,
      502
    );
  }

  const text =
    String(value);

  if (
    !/^(0|[1-9][0-9]*)$/.test(text)
  ) {
    throw failure(
      "POINTS_REVIVE_RESPONSE_INVALID",
      `${field} không hợp lệ`,
      502
    );
  }

  const integer =
    BigInt(text);

  if (
    integer < min ||
    integer > max
  ) {
    throw failure(
      "POINTS_REVIVE_RESPONSE_INVALID",
      `${field} vượt giới hạn`,
      502
    );
  }

  return integer;
}

function mapRpcFailure(error) {
  const message =
    String(error?.message || "");

  const mappings = [
    [
      "POINTS_REVIVE_PRICE_NOT_CONFIGURED",
      503,
      "Giá Revive Credit bằng điểm chưa hợp lệ",
    ],
    [
      "POINTS_REVIVE_INSUFFICIENT_POINTS",
      409,
      "Bạn không đủ điểm tích lũy",
    ],
    [
      "POINTS_REVIVE_REQUEST_CONFLICT",
      409,
      "Mã yêu cầu đã được sử dụng cho giao dịch khác",
    ],
    [
      "POINTS_REVIVE_PLAYER_NOT_FOUND",
      404,
      "Không tìm thấy tài khoản thành viên",
    ],
    [
      "POINTS_REVIVE_QUANTITY_INVALID",
      400,
      "Số Revive Credit không hợp lệ",
    ],
    [
      "POINTS_REVIVE_UNIT_PRICE_OVERFLOW",
      400,
      "Giá Revive Credit vượt giới hạn",
    ],
    [
      "POINTS_REVIVE_TOTAL_OVERFLOW",
      400,
      "Số lượng mua vượt giới hạn",
    ],
  ];

  for (
    const [
      code,
      statusCode,
      publicMessage,
    ] of mappings
  ) {
    if (
      message.includes(code)
    ) {
      return failure(
        code,
        publicMessage,
        statusCode,
        error
      );
    }
  }

  return failure(
    "POINTS_REVIVE_PURCHASE_FAILED",
    "Chưa thể xác minh giao dịch mua Revive Credit",
    500,
    error
  );
}

function receiptOf(
  data,
  requestId,
  quantity
) {
  if (
    !Array.isArray(data) ||
    data.length !== 1
  ) {
    throw failure(
      "POINTS_REVIVE_RESPONSE_INVALID",
      "Chưa xác minh được biên nhận giao dịch",
      502
    );
  }

  const result =
    data[0];

  if (
    !result ||
    typeof result.applied !== "boolean" ||
    String(
      result.request_id || ""
    ).toLowerCase() !== requestId ||
    result.quantity !== quantity ||
    ![
      "pending",
      "processing",
      "synced",
      "failed",
    ].includes(
      result.ipos_sync_status
    )
  ) {
    throw failure(
      "POINTS_REVIVE_RESPONSE_INVALID",
      "Biên nhận giao dịch không khớp yêu cầu",
      502
    );
  }

  const vnd =
    decimalInteger(
      result.unit_price_vnd,
      "unit_price_vnd",
      { min: 1000n }
    );

  const points =
    decimalInteger(
      result.unit_price_points,
      "unit_price_points",
      {
        min: 1n,
        max: BigInt(MAX_INT),
      }
    );

  const total =
    decimalInteger(
      result.total_points,
      "total_points",
      {
        min: 1n,
        max: BigInt(MAX_INT),
      }
    );

  const balance =
    decimalInteger(
      result.points_balance_after,
      "points_balance_after",
      {
        max: BigInt(MAX_INT),
      }
    );

  const creditBalance =
    decimalInteger(
      result.credit_balance_after,
      "credit_balance_after",
      {
        max: BigInt(MAX_INT),
      }
    );

  const creditTransactionId =
    decimalInteger(
      result.credit_transaction_id,
      "credit_transaction_id",
      {
        min: 1n,
        max: 9223372036854775807n,
      }
    );

  if (
    vnd % 1000n !== 0n ||
    vnd / 1000n !== points ||
    points * BigInt(quantity) !== total
  ) {
    throw failure(
      "POINTS_REVIVE_RESPONSE_INVALID",
      "Giá điểm trong biên nhận không nhất quán",
      502
    );
  }

  return {
    applied:
      result.applied,

    request_id:
      requestId,

    quantity,

    unit_price_vnd:
      vnd.toString(),

    unit_price_points:
      Number(points),

    total_points:
      Number(total),

    points_balance_after:
      Number(balance),

    credit_transaction_id:
      creditTransactionId.toString(),

    credit_balance_after:
      Number(creditBalance),

    ipos_sync_status:
      result.ipos_sync_status,
  };
}

async function buyReviveCreditsWithPoints({
  customer,
  quantity,
  requestId,
}) {
  const userId =
    normalizePhone(
      customer?.phone || ""
    );

  if (!userId) {
    throw failure(
      "POINTS_REVIVE_MEMBER_IDENTITY_REQUIRED",
      "Không xác định được tài khoản thành viên",
      401
    );
  }

  const normalizedQuantity =
    quantityOf(quantity);

  const normalizedRequestId =
    requestIdOf(requestId);

  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_points_purchase_revive_credits_v1",
    {
      p_user_id:
        userId,

      p_quantity:
        normalizedQuantity,

      p_request_id:
        normalizedRequestId,
    }
  );

  if (error) {
    throw mapRpcFailure(
      error
    );
  }

  return receiptOf(
    data,
    normalizedRequestId,
    normalizedQuantity
  );
}

module.exports = {
  buyReviveCreditsWithPoints,
};
