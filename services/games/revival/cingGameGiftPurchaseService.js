"use strict";

const supabase =
  require("../../../supabase");

const {
  normalizePhone,
} = require(
  "../../../utils/phoneIdentity"
);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const GIFT_ID =
  /^[a-z0-9][a-z0-9_-]{0,63}$/;

const MAX_INT =
  2147483647n;

const MAX_BIGINT =
  9223372036854775807n;

const MAX_MESSAGE_CHARS =
  200;

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

function validUuid(value) {
  return (
    typeof value === "string" &&
    UUID.test(
      value.trim().toLowerCase()
    )
  );
}

function normalizeSenderMessage(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (typeof value !== "string") {
    throw failure(
      "GAME_GIFT_MESSAGE_INVALID",
      "Lời nhắn không hợp lệ",
      400
    );
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return null;
  }

  if (
    Array.from(normalized).length >
      MAX_MESSAGE_CHARS
  ) {
    throw failure(
      "GAME_GIFT_MESSAGE_INVALID",
      `Lời nhắn tối đa ${MAX_MESSAGE_CHARS} ký tự`,
      400
    );
  }

  return normalized;
}

function integer(
  value,
  name,
  max = MAX_BIGINT,
  min = 0n
) {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw failure(
      "GAME_GIFT_RECEIPT_INVALID",
      `${name} không hợp lệ`,
      502
    );
  }

  if (
    typeof value === "number" &&
    !Number.isSafeInteger(value)
  ) {
    throw failure(
      "GAME_GIFT_RECEIPT_INVALID",
      `${name} không phải số nguyên an toàn`,
      502
    );
  }

  const text =
    String(value);

  if (
    !/^(0|[1-9][0-9]*)$/.test(text)
  ) {
    throw failure(
      "GAME_GIFT_RECEIPT_INVALID",
      `${name} không hợp lệ`,
      502
    );
  }

  const number =
    BigInt(text);

  if (
    number < min ||
    number > max
  ) {
    throw failure(
      "GAME_GIFT_RECEIPT_INVALID",
      `${name} vượt giới hạn`,
      502
    );
  }

  return number;
}

function mapRpcError(error) {
  const raw =
    String(error?.message || "");

  const mappings = [
    [
      "GAME_GIFT_REQUEST_CONFLICT",
      409,
      "Mã yêu cầu đã dùng cho giao dịch khác",
    ],
    [
      "GAME_GIFT_INSUFFICIENT_POINTS",
      409,
      "Bạn không đủ điểm tích lũy",
    ],
    [
      "CING_WALLET_INSUFFICIENT_BALANCE",
      409,
      "Số dư Cing Wallet không đủ",
    ],
    [
      "GAME_GIFT_NOT_AVAILABLE",
      409,
      "Vật phẩm hiện chưa mở bán",
    ],
    [
      "GAME_GIFT_SELF_GIFT_FORBIDDEN",
      400,
      "Không thể tự tặng vật phẩm cho mình",
    ],
    [
      "GAME_GIFT_RECIPIENT_NOT_FOUND",
      404,
      "Không tìm thấy người nhận",
    ],
    [
      "GAME_GIFT_SENDER_NOT_FOUND",
      404,
      "Không tìm thấy tài khoản thành viên",
    ],
  ];

  for (
    const [
      code,
      status,
      message,
    ] of mappings
  ) {
    if (raw.includes(code)) {
      return failure(
        code,
        message,
        status,
        error
      );
    }
  }

  return failure(
    "GAME_GIFT_PURCHASE_UNVERIFIED",
    "Chưa thể xác minh giao dịch tặng vật phẩm",
    503,
    error
  );
}

function receiptOf(
  data,
  expected
) {
  const row =
    Array.isArray(data)
      ? (
          data.length === 1
            ? data[0]
            : null
        )
      : data;

  if (
    !row ||
    typeof row !== "object" ||
    typeof row.applied !== "boolean" ||
    String(
      row.request_id || ""
    ).toLowerCase() !==
      expected.requestId ||
    row.sender_user_id !==
      expected.senderId ||
    row.recipient_user_id !==
      expected.recipientId ||
    row.gift_id !==
      expected.giftId ||
    row.funding_source !==
      expected.fundingSource ||
    (
      row.sender_message ?? null
    ) !== expected.senderMessage
  ) {
    throw failure(
      "GAME_GIFT_RECEIPT_INVALID",
      "Biên nhận tặng vật phẩm không khớp yêu cầu",
      502
    );
  }

  if (
    typeof row.gift_name !==
      "string" ||
    !row.gift_name.trim() ||
    typeof row.gift_icon !==
      "string" ||
    !row.gift_icon.trim()
  ) {
    throw failure(
      "GAME_GIFT_RECEIPT_INVALID",
      "Thông tin vật phẩm trong biên nhận không hợp lệ",
      502
    );
  }

  const price =
    integer(
      row.price_vnd,
      "price_vnd",
      MAX_BIGINT,
      1000n
    );

  const charm =
    integer(
      row.charm_awarded,
      "charm_awarded",
      MAX_INT,
      1n
    );

  const charmAfter =
    integer(
      row.charm_balance_after,
      "charm_balance_after"
    );

  if (
    price % 1000n !== 0n ||
    charmAfter < charm ||
    price / 1000n > MAX_INT
  ) {
    throw failure(
      "GAME_GIFT_RECEIPT_INVALID",
      "Giá hoặc Charm trong biên nhận không nhất quán",
      502
    );
  }

  let pointsCost = null;
  let pointsAfter = null;
  let walletTransactionId = null;

  if (
    expected.fundingSource ===
      "points"
  ) {
    const parsedCost =
      integer(
        row.points_cost,
        "points_cost",
        MAX_INT,
        1n
      );

    const parsedAfter =
      integer(
        row.points_balance_after,
        "points_balance_after",
        MAX_INT
      );

    if (
      parsedCost !==
        price / 1000n ||
      row.wallet_transaction_id !==
        null ||
      ![
        "pending",
        "processing",
        "synced",
        "failed",
      ].includes(
        row.ipos_sync_status
      )
    ) {
      throw failure(
        "GAME_GIFT_RECEIPT_INVALID",
        "Biên nhận Gift bằng điểm không hợp lệ",
        502
      );
    }

    pointsCost =
      Number(parsedCost);

    pointsAfter =
      Number(parsedAfter);
  } else {
    if (
      !validUuid(
        row.wallet_transaction_id
      ) ||
      row.points_cost !== null ||
      row.points_balance_after !==
        null ||
      row.ipos_sync_status !==
        "not_required"
    ) {
      throw failure(
        "GAME_GIFT_RECEIPT_INVALID",
        "Biên nhận Gift bằng Wallet không hợp lệ",
        502
      );
    }

    walletTransactionId =
      row.wallet_transaction_id
        .toLowerCase();
  }

  return {
    applied:
      row.applied,

    request_id:
      expected.requestId,

    sender_user_id:
      expected.senderId,

    recipient_user_id:
      expected.recipientId,

    gift_id:
      expected.giftId,

    gift_name:
      row.gift_name,

    gift_icon:
      row.gift_icon,

    funding_source:
      expected.fundingSource,

    sender_message:
      expected.senderMessage,

    price_vnd:
      price.toString(),

    points_cost:
      pointsCost,

    points_balance_after:
      pointsAfter,

    charm_awarded:
      Number(charm),

    charm_balance_after:
      charmAfter.toString(),

    wallet_transaction_id:
      walletTransactionId,

    ipos_sync_status:
      row.ipos_sync_status,
  };
}

async function purchaseGameGift({
  customer,
  recipientUserId,
  giftId,
  requestId,
  senderMessage,
  fundingSource,
}) {
  const senderId =
    normalizePhone(
      customer?.phone || ""
    );

  if (!senderId) {
    throw failure(
      "GAME_GIFT_AUTH_REQUIRED",
      "Không xác định được tài khoản thành viên",
      401
    );
  }

  if (
    fundingSource !== "wallet" &&
    fundingSource !== "points"
  ) {
    throw failure(
      "GAME_GIFT_FUNDING_INVALID",
      "Phương thức thanh toán không hợp lệ",
      400
    );
  }

  const recipientId =
    normalizePhone(
      typeof recipientUserId ===
        "string"
        ? recipientUserId
        : ""
    );

  if (!recipientId) {
    throw failure(
      "GAME_GIFT_RECIPIENT_INVALID",
      "Người nhận không hợp lệ",
      400
    );
  }

  if (recipientId === senderId) {
    throw failure(
      "GAME_GIFT_SELF_GIFT_FORBIDDEN",
      "Không thể tự tặng vật phẩm cho mình",
      400
    );
  }

  const normalizedGiftId =
    typeof giftId === "string"
      ? giftId.trim()
      : "";

  if (
    !GIFT_ID.test(
      normalizedGiftId
    )
  ) {
    throw failure(
      "GAME_GIFT_ID_INVALID",
      "Mã vật phẩm không hợp lệ",
      400
    );
  }

  const normalizedRequestId =
    typeof requestId === "string"
      ? requestId
          .trim()
          .toLowerCase()
      : "";

  if (
    !validUuid(
      normalizedRequestId
    )
  ) {
    throw failure(
      "GAME_GIFT_REQUEST_ID_INVALID",
      "Mã giao dịch không hợp lệ",
      400
    );
  }

  const normalizedSenderMessage =
    normalizeSenderMessage(
      senderMessage
    );

  const rpcName =
    fundingSource === "wallet"
      ? "cing_game_gift_purchase_wallet_v2"
      : "cing_game_gift_purchase_points_v2";

  const {
    data,
    error,
  } = await supabase.rpc(
    rpcName,
    {
      p_sender_user_id:
        senderId,

      p_recipient_user_id:
        recipientId,

      p_gift_id:
        normalizedGiftId,

      p_request_id:
        normalizedRequestId,

      p_sender_message:
        normalizedSenderMessage,
    }
  );

  if (error) {
    throw mapRpcError(error);
  }

  return receiptOf(
    data,
    {
      senderId,
      recipientId,
      giftId:
        normalizedGiftId,

      requestId:
        normalizedRequestId,

      fundingSource,

      senderMessage:
        normalizedSenderMessage,
    }
  );
}

module.exports = {
  purchaseGameGift,
};
