const supabase =
  require("../../supabase");

const {
  normalizePhone,
} = require(
  "../../utils/phoneIdentity"
);


function createWalletPlayPurchaseError({
  message,
  code,
  statusCode,
  cause,
}) {
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


function resolveWalletPlayPurchaseUserId(
  customer
) {
  const userId =
    normalizePhone(
      customer?.phone || ""
    );

  if (!userId) {
    throw createWalletPlayPurchaseError({
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


function normalizePlayQuantity(
  value
) {
  let quantity;

  if (
    typeof value ===
      "number"
  ) {
    quantity =
      value;
  } else if (
    typeof value ===
      "string" &&
    /^[0-9]+$/.test(
      value.trim()
    )
  ) {
    quantity =
      Number(
        value.trim()
      );
  } else {
    throw createWalletPlayPurchaseError({
      message:
        "Số lượt chơi không hợp lệ",

      code:
        "CING_WALLET_PLAY_PURCHASE_QUANTITY_INVALID",

      statusCode:
        400,
    });
  }

  if (
    !Number.isSafeInteger(
      quantity
    ) ||
    quantity <= 0 ||
    quantity >
      2147483647
  ) {
    throw createWalletPlayPurchaseError({
      message:
        "Số lượt chơi không hợp lệ",

      code:
        "CING_WALLET_PLAY_PURCHASE_QUANTITY_INVALID",

      statusCode:
        400,
    });
  }

  return quantity;
}


function normalizeRequestId(
  value
) {
  const requestId =
    String(
      value || ""
    ).trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(
        requestId
      )
  ) {
    throw createWalletPlayPurchaseError({
      message:
        "Mã yêu cầu mua lượt không hợp lệ",

      code:
        "CING_WALLET_PLAY_PURCHASE_REQUEST_ID_INVALID",

      statusCode:
        400,
    });
  }

  return requestId;
}


function mapPurchaseRpcError(
  rpcError
) {
  const message =
    String(
      rpcError?.message ||
      ""
    );

  if (
    message.includes(
      "CING_WALLET_PLAY_PURCHASE_PRICE_NOT_CONFIGURED"
    )
  ) {
    return createWalletPlayPurchaseError({
      message:
        "Tính năng mua lượt bằng Cing Wallet chưa được mở",

      code:
        "CING_WALLET_PLAY_PURCHASE_PRICE_NOT_CONFIGURED",

      statusCode:
        503,

      cause:
        rpcError,
    });
  }

  if (
    message.includes(
      "CING_WALLET_INSUFFICIENT_BALANCE"
    )
  ) {
    return createWalletPlayPurchaseError({
      message:
        "Số dư Cing Wallet không đủ",

      code:
        "CING_WALLET_INSUFFICIENT_BALANCE",

      statusCode:
        409,

      cause:
        rpcError,
    });
  }

  if (
    message.includes(
      "CING_WALLET_USER_NOT_FOUND"
    ) ||
    message.includes(
      "CING_WALLET_PLAY_PURCHASE_PLAYER_NOT_FOUND"
    )
  ) {
    return createWalletPlayPurchaseError({
      message:
        "Không tìm thấy tài khoản thành viên",

      code:
        "CING_WALLET_PLAYER_NOT_FOUND",

      statusCode:
        404,

      cause:
        rpcError,
    });
  }

  if (
    message.includes(
      "CING_WALLET_PLAY_PURCHASE_REPLAY_CONFLICT"
    )
  ) {
    return createWalletPlayPurchaseError({
      message:
        "Yêu cầu mua lượt không khớp với giao dịch trước đó",

      code:
        "CING_WALLET_PLAY_PURCHASE_REPLAY_CONFLICT",

      statusCode:
        409,

      cause:
        rpcError,
    });
  }

  return createWalletPlayPurchaseError({
    message:
      "Không thể mua lượt chơi bằng Cing Wallet",

    code:
      "CING_WALLET_PLAY_PURCHASE_FAILED",

    statusCode:
      500,

    cause:
      rpcError,
  });
}


function normalizePurchaseResult(
  row
) {
  if (!row) {
    throw createWalletPlayPurchaseError({
      message:
        "Không nhận được kết quả giao dịch",

      code:
        "CING_WALLET_PLAY_PURCHASE_EMPTY_RESULT",

      statusCode:
        500,
    });
  }

  const quantity =
    Number(
      row.quantity
    );

  const unitPrice =
    Number(
      row.unit_price
    );

  const totalCost =
    Number(
      row.total_cost
    );

  const walletBalanceAfter =
    Number(
      row.wallet_balance_after
    );

  const gamePlaysAfter =
    Number(
      row.game_plays_after
    );

  if (
    !Number.isSafeInteger(
      quantity
    ) ||
    quantity <= 0 ||
    !Number.isSafeInteger(
      unitPrice
    ) ||
    unitPrice <= 0 ||
    !Number.isSafeInteger(
      totalCost
    ) ||
    totalCost <= 0 ||
    !Number.isSafeInteger(
      walletBalanceAfter
    ) ||
    walletBalanceAfter < 0 ||
    !Number.isSafeInteger(
      gamePlaysAfter
    ) ||
    gamePlaysAfter < 0
  ) {
    throw createWalletPlayPurchaseError({
      message:
        "Kết quả giao dịch Cing Wallet không hợp lệ",

      code:
        "CING_WALLET_PLAY_PURCHASE_RESULT_INVALID",

      statusCode:
        500,
    });
  }

  return {
    applied:
      row.applied === true,

    request_id:
      row.request_id,

    wallet_transaction_id:
      row.wallet_transaction_id,

    quantity,

    unit_price:
      unitPrice,

    total_cost:
      totalCost,

    wallet_balance_after:
      walletBalanceAfter,

    game_plays_after:
      gamePlaysAfter,
  };
}


async function buyGamePlaysWithWallet({
  customer,
  quantity,
  requestId,
}) {
  const userId =
    resolveWalletPlayPurchaseUserId(
      customer
    );

  const normalizedQuantity =
    normalizePlayQuantity(
      quantity
    );

  const normalizedRequestId =
    normalizeRequestId(
      requestId
    );

  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_wallet_purchase_game_plays_atomic_v1",
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
    throw mapPurchaseRpcError(
      error
    );
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  return normalizePurchaseResult(
    row
  );
}


module.exports = {
  resolveWalletPlayPurchaseUserId,
  normalizePlayQuantity,
  normalizeRequestId,
  buyGamePlaysWithWallet,
};
