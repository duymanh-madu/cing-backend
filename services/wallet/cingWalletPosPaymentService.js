"use strict";

const crypto =
  require("node:crypto");

const supabase =
  require("../../supabase");

const {
  normalizePhone,
} = require(
  "../../utils/phoneIdentity"
);


const CAPABILITY_PREFIX =
  "CING_WALLET_PAY_V1";

const DEFAULT_TTL_SECONDS =
  300;

const MAX_TTL_SECONDS =
  900;


function createPosPaymentError({
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


function requireSecret(
  name
) {
  const value =
    String(
      process.env[name] || ""
    ).trim();

  if (
    value.length <
    32
  ) {
    throw createPosPaymentError({
      message:
        "Cấu hình bảo mật Cing Wallet POS chưa sẵn sàng",
      code:
        "CING_WALLET_POS_SECURITY_NOT_CONFIGURED",
      statusCode:
        503,
    });
  }

  return value;
}


function getQrSecret() {
  return requireSecret(
    "CING_WALLET_POS_QR_SECRET"
  );
}


function getIposEpaymentKey() {
  return requireSecret(
    "CING_WALLET_IPOS_EPAYMENT_KEY"
  );
}


function assertPosEpaymentEnabled() {
  const enabled =
    String(
      process.env
        .CING_WALLET_POS_EPAYMENT_ENABLED ||
      ""
    )
      .trim()
      .toLowerCase() ===
    "true";

  if (!enabled) {
    throw createPosPaymentError({
      message:
        "Thanh toán Cing Wallet tại quầy chưa được mở",
      code:
        "CING_WALLET_POS_EP_PAYMENT_DISABLED",
      statusCode:
        503,
    });
  }
}


function safeEqualText(
  actual,
  expected
) {
  const actualBuffer =
    Buffer.from(
      String(
        actual || ""
      ),
      "utf8"
    );

  const expectedBuffer =
    Buffer.from(
      String(
        expected || ""
      ),
      "utf8"
    );

  if (
    actualBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return crypto
    .timingSafeEqual(
      actualBuffer,
      expectedBuffer
    );
}


function assertIposEpaymentCredential(
  value
) {
  const expected =
    getIposEpaymentKey();

  if (
    !safeEqualText(
      value,
      expected
    )
  ) {
    throw createPosPaymentError({
      message:
        "Không được phép truy cập Cing Wallet Epayment",
      code:
        "CING_WALLET_POS_IPOS_UNAUTHORIZED",
      statusCode:
        401,
    });
  }
}


function normalizeNonEmptyText(
  value,
  {
    code,
    message,
    maxLength = 200,
  }
) {
  const normalized =
    String(
      value ?? ""
    ).trim();

  if (
    !normalized ||
    normalized.length >
      maxLength
  ) {
    throw createPosPaymentError({
      message,
      code,
      statusCode:
        400,
    });
  }

  return normalized;
}


function normalizeOptionalText(
  value,
  maxLength = 200
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const normalized =
    String(value).trim();

  if (
    !normalized ||
    normalized.length >
      maxLength
  ) {
    throw createPosPaymentError({
      message:
        "Mã hóa đơn iPOS không hợp lệ",
      code:
        "CING_WALLET_POS_BILL_REFERENCE_INVALID",
      statusCode:
        400,
    });
  }

  return normalized;
}


function normalizeAmount(
  value
) {
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
    amount =
      NaN;
  }

  if (
    !Number.isSafeInteger(
      amount
    ) ||
    amount <= 0
  ) {
    throw createPosPaymentError({
      message:
        "Số tiền thanh toán không hợp lệ",
      code:
        "CING_WALLET_POS_AMOUNT_INVALID",
      statusCode:
        400,
    });
  }

  return amount;
}


function normalizeTtlSeconds(
  value
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return DEFAULT_TTL_SECONDS;
  }

  const ttl =
    Number(value);

  if (
    !Number.isSafeInteger(
      ttl
    ) ||
    ttl <= 0 ||
    ttl >
      MAX_TTL_SECONDS
  ) {
    throw createPosPaymentError({
      message:
        "Thời hạn QR không hợp lệ",
      code:
        "CING_WALLET_POS_TTL_INVALID",
      statusCode:
        400,
    });
  }

  return ttl;
}


function buildProviderRequestKey({
  transactionId,
  posParent,
  posId,
}) {
  return [
    "ipos",
    posParent,
    posId,
    transactionId,
  ].join(":");
}


function encodeBase64Url(
  value
) {
  return Buffer
    .from(
      value,
      "utf8"
    )
    .toString(
      "base64url"
    );
}


function decodeBase64Url(
  value
) {
  return Buffer
    .from(
      value,
      "base64url"
    )
    .toString(
      "utf8"
    );
}


function signCapabilityPayload(
  payloadPart
) {
  return crypto
    .createHmac(
      "sha256",
      getQrSecret()
    )
    .update(
      payloadPart,
      "utf8"
    )
    .digest(
      "base64url"
    );
}


function createQrCapability({
  paymentTokenId,
  expiresAt,
}) {
  const expirySeconds =
    Math.floor(
      new Date(
        expiresAt
      ).getTime() /
      1000
    );

  if (
    !Number.isSafeInteger(
      expirySeconds
    ) ||
    expirySeconds <= 0
  ) {
    throw createPosPaymentError({
      message:
        "Thời hạn QR không hợp lệ",
      code:
        "CING_WALLET_POS_CAPABILITY_EXPIRY_INVALID",
      statusCode:
        500,
    });
  }

  const payload =
    JSON.stringify({
      v:
        1,

      t:
        String(
          paymentTokenId
        ),

      e:
        expirySeconds,
    });

  const payloadPart =
    encodeBase64Url(
      payload
    );

  const signature =
    signCapabilityPayload(
      payloadPart
    );

  return [
    CAPABILITY_PREFIX,
    payloadPart,
    signature,
  ].join(".");
}


function verifyQrCapability(
  capability
) {
  const raw =
    String(
      capability || ""
    ).trim();

  const parts =
    raw.split(".");

  if (
    parts.length !== 3 ||
    parts[0] !==
      CAPABILITY_PREFIX
  ) {
    throw createPosPaymentError({
      message:
        "Mã thanh toán Cing Wallet không hợp lệ",
      code:
        "CING_WALLET_POS_CAPABILITY_INVALID",
      statusCode:
        400,
    });
  }

  const payloadPart =
    parts[1];

  const signature =
    parts[2];

  const expectedSignature =
    signCapabilityPayload(
      payloadPart
    );

  if (
    !safeEqualText(
      signature,
      expectedSignature
    )
  ) {
    throw createPosPaymentError({
      message:
        "Mã thanh toán Cing Wallet không hợp lệ",
      code:
        "CING_WALLET_POS_CAPABILITY_INVALID",
      statusCode:
        400,
    });
  }

  let payload;

  try {
    payload =
      JSON.parse(
        decodeBase64Url(
          payloadPart
        )
      );
  } catch {
    throw createPosPaymentError({
      message:
        "Mã thanh toán Cing Wallet không hợp lệ",
      code:
        "CING_WALLET_POS_CAPABILITY_INVALID",
      statusCode:
        400,
    });
  }

  const tokenId =
    String(
      payload?.t || ""
    ).trim();

  const expirySeconds =
    Number(
      payload?.e
    );

  if (
    payload?.v !== 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(
        tokenId
      ) ||
    !Number.isSafeInteger(
      expirySeconds
    ) ||
    expirySeconds <= 0
  ) {
    throw createPosPaymentError({
      message:
        "Mã thanh toán Cing Wallet không hợp lệ",
      code:
        "CING_WALLET_POS_CAPABILITY_INVALID",
      statusCode:
        400,
    });
  }

  const nowSeconds =
    Math.floor(
      Date.now() /
      1000
    );

  if (
    expirySeconds <=
    nowSeconds
  ) {
    throw createPosPaymentError({
      message:
        "Mã thanh toán đã hết hạn",
      code:
        "CING_WALLET_POS_PAYMENT_EXPIRED",
      statusCode:
        410,
    });
  }

  return {
    paymentTokenId:
      tokenId,

    expiresAt:
      new Date(
        expirySeconds *
        1000
      ).toISOString(),
  };
}


function resolveCustomerUserId(
  customer
) {
  const userId =
    normalizePhone(
      customer?.phone || ""
    );

  if (!userId) {
    throw createPosPaymentError({
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


function mapRpcError(
  rpcError
) {
  const message =
    String(
      rpcError?.message ||
      ""
    );

  const rules = [
    {
      token:
        "CING_WALLET_INSUFFICIENT_BALANCE",
      message:
        "Số dư Cing Wallet không đủ",
      code:
        "CING_WALLET_INSUFFICIENT_BALANCE",
      statusCode:
        409,
    },
    {
      token:
        "CING_WALLET_POS_PAYMENT_EXPIRED",
      message:
        "Mã thanh toán đã hết hạn",
      code:
        "CING_WALLET_POS_PAYMENT_EXPIRED",
      statusCode:
        410,
    },
    {
      token:
        "CING_WALLET_POS_PAYMENT_ALREADY_PAID",
      message:
        "Giao dịch đã được thanh toán",
      code:
        "CING_WALLET_POS_PAYMENT_ALREADY_PAID",
      statusCode:
        409,
    },
    {
      token:
        "CING_WALLET_POS_PAYMENT_NOT_PAYABLE",
      message:
        "Giao dịch không còn khả dụng để thanh toán",
      code:
        "CING_WALLET_POS_PAYMENT_NOT_PAYABLE",
      statusCode:
        409,
    },
    {
      token:
        "CING_WALLET_POS_PAYMENT_NOT_FOUND",
      message:
        "Không tìm thấy giao dịch thanh toán",
      code:
        "CING_WALLET_POS_PAYMENT_NOT_FOUND",
      statusCode:
        404,
    },
    {
      token:
        "CING_WALLET_USER_NOT_FOUND",
      message:
        "Không tìm thấy tài khoản thành viên",
      code:
        "CING_WALLET_PLAYER_NOT_FOUND",
      statusCode:
        404,
    },
    {
      token:
        "CING_WALLET_POS_CREATE_REPLAY_CONFLICT",
      message:
        "Thông tin giao dịch iPOS không khớp với yêu cầu trước đó",
      code:
        "CING_WALLET_POS_CREATE_REPLAY_CONFLICT",
      statusCode:
        409,
    },
  ];

  for (
    const rule of rules
  ) {
    if (
      message.includes(
        rule.token
      )
    ) {
      return createPosPaymentError({
        message:
          rule.message,
        code:
          rule.code,
        statusCode:
          rule.statusCode,
        cause:
          rpcError,
      });
    }
  }

  return createPosPaymentError({
    message:
      "Không thể xử lý thanh toán Cing Wallet tại quầy",
    code:
      "CING_WALLET_POS_PAYMENT_FAILED",
    statusCode:
      500,
    cause:
      rpcError,
  });
}


function firstRpcRow(
  data
) {
  return Array.isArray(data)
    ? data[0]
    : data;
}


function normalizeIntentRow(
  row
) {
  if (!row) {
    throw createPosPaymentError({
      message:
        "Không nhận được trạng thái giao dịch",
      code:
        "CING_WALLET_POS_EMPTY_RESULT",
      statusCode:
        500,
    });
  }

  const amount =
    Number(
      row.amount
    );

  if (
    !Number.isSafeInteger(
      amount
    ) ||
    amount <= 0
  ) {
    throw createPosPaymentError({
      message:
        "Dữ liệu giao dịch không hợp lệ",
      code:
        "CING_WALLET_POS_RESULT_INVALID",
      statusCode:
        500,
    });
  }

  return {
    intent_id:
      row.intent_id,

    payment_token_id:
      row.payment_token_id,

    provider_request_key:
      row.provider_request_key,

    bill_reference:
      row.bill_reference ??
      null,

    amount,

    status:
      String(
        row.status || ""
      ),

    expires_at:
      row.expires_at,

    paid_at:
      row.paid_at ??
      null,

    wallet_balance:
      row.wallet_balance ===
        undefined
        ? undefined
        : Number(
            row.wallet_balance
          ),

    wallet_balance_after:
      row.wallet_balance_after ===
        undefined
        ? undefined
        : Number(
            row.wallet_balance_after
          ),

    wallet_transaction_id:
      row.wallet_transaction_id ??
      null,

    applied:
      row.applied === true,
  };
}


async function createIposPosPayment({
  transactionId,
  posParent,
  posId,
  billReference,
  amount,
  ttlSeconds,
}) {
  const normalizedTransactionId =
    normalizeNonEmptyText(
      transactionId,
      {
        code:
          "CING_WALLET_POS_TRANSACTION_ID_INVALID",
        message:
          "Mã giao dịch iPOS không hợp lệ",
      }
    );

  const normalizedPosParent =
    normalizeNonEmptyText(
      posParent,
      {
        code:
          "CING_WALLET_POS_PARENT_INVALID",
        message:
          "Mã merchant iPOS không hợp lệ",
      }
    );

  const normalizedPosId =
    normalizeNonEmptyText(
      posId,
      {
        code:
          "CING_WALLET_POS_ID_INVALID",
        message:
          "Mã POS iPOS không hợp lệ",
      }
    );

  const normalizedBillReference =
    normalizeOptionalText(
      billReference
    );

  const normalizedAmount =
    normalizeAmount(
      amount
    );

  const normalizedTtl =
    normalizeTtlSeconds(
      ttlSeconds
    );

  const providerRequestKey =
    buildProviderRequestKey({
      transactionId:
        normalizedTransactionId,

      posParent:
        normalizedPosParent,

      posId:
        normalizedPosId,
    });

  const expiresAt =
    new Date(
      Date.now() +
      normalizedTtl *
      1000
    ).toISOString();

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_wallet_create_pos_payment_intent_v1",
      {
        p_provider_request_key:
          providerRequestKey,

        p_pos_parent:
          normalizedPosParent,

        p_pos_id:
          normalizedPosId,

        p_bill_reference:
          normalizedBillReference,

        p_amount:
          normalizedAmount,

        p_expires_at:
          expiresAt,

        p_metadata: {
          ipos_transaction_id:
            normalizedTransactionId,
        },
      }
    );

  if (error) {
    throw mapRpcError(
      error
    );
  }

  const row =
    normalizeIntentRow(
      firstRpcRow(
        data
      )
    );

  if (
    !row.payment_token_id ||
    !row.expires_at
  ) {
    throw createPosPaymentError({
      message:
        "Không thể tạo QR thanh toán",
      code:
        "CING_WALLET_POS_CREATE_RESULT_INVALID",
      statusCode:
        500,
    });
  }

  const capability =
    createQrCapability({
      paymentTokenId:
        row.payment_token_id,

      expiresAt:
        row.expires_at,
    });

  return {
    transaction_id:
      normalizedTransactionId,

    provider_request_key:
      providerRequestKey,

    intent_id:
      row.intent_id,

    amount:
      row.amount,

    status:
      row.status,

    expires_at:
      row.expires_at,

    qr_content:
      capability,
  };
}


async function queryIposPosPayment({
  transactionId,
  posParent,
  posId,
}) {
  const normalizedTransactionId =
    normalizeNonEmptyText(
      transactionId,
      {
        code:
          "CING_WALLET_POS_TRANSACTION_ID_INVALID",
        message:
          "Mã giao dịch iPOS không hợp lệ",
      }
    );

  const normalizedPosParent =
    normalizeNonEmptyText(
      posParent,
      {
        code:
          "CING_WALLET_POS_PARENT_INVALID",
        message:
          "Mã merchant iPOS không hợp lệ",
      }
    );

  const normalizedPosId =
    normalizeNonEmptyText(
      posId,
      {
        code:
          "CING_WALLET_POS_ID_INVALID",
        message:
          "Mã POS iPOS không hợp lệ",
      }
    );

  const providerRequestKey =
    buildProviderRequestKey({
      transactionId:
        normalizedTransactionId,

      posParent:
        normalizedPosParent,

      posId:
        normalizedPosId,
    });

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_wallet_query_pos_payment_intent_v1",
      {
        p_provider_request_key:
          providerRequestKey,
      }
    );

  if (error) {
    throw mapRpcError(
      error
    );
  }

  const row =
    normalizeIntentRow(
      firstRpcRow(
        data
      )
    );

  return {
    transaction_id:
      normalizedTransactionId,

    provider_request_key:
      providerRequestKey,

    bill_reference:
      row.bill_reference,

    amount:
      row.amount,

    status:
      row.status,

    expires_at:
      row.expires_at,

    paid_at:
      row.paid_at,
  };
}


async function previewCustomerPosPayment({
  customer,
  capability,
}) {
  const userId =
    resolveCustomerUserId(
      customer
    );

  const verified =
    verifyQrCapability(
      capability
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_wallet_get_pos_payment_for_customer_v1",
      {
        p_payment_token_id:
          verified.paymentTokenId,

        p_user_id:
          userId,
      }
    );

  if (error) {
    throw mapRpcError(
      error
    );
  }

  const row =
    normalizeIntentRow(
      firstRpcRow(
        data
      )
    );

  if (
    !Number.isSafeInteger(
      row.wallet_balance
    ) ||
    row.wallet_balance < 0
  ) {
    throw createPosPaymentError({
      message:
        "Dữ liệu số dư Cing Wallet không hợp lệ",
      code:
        "CING_WALLET_POS_BALANCE_INVALID",
      statusCode:
        500,
    });
  }

  return {
    intent_id:
      row.intent_id,

    bill_reference:
      row.bill_reference,

    amount:
      row.amount,

    status:
      row.status,

    expires_at:
      row.expires_at,

    wallet_balance:
      row.wallet_balance,

    sufficient_balance:
      row.wallet_balance >=
      row.amount,

    shortfall:
      Math.max(
        0,
        row.amount -
        row.wallet_balance
      ),
  };
}


async function confirmCustomerPosPayment({
  customer,
  capability,
}) {
  const userId =
    resolveCustomerUserId(
      customer
    );

  const verified =
    verifyQrCapability(
      capability
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_wallet_settle_pos_payment_atomic_v1",
      {
        p_payment_token_id:
          verified.paymentTokenId,

        p_user_id:
          userId,
      }
    );

  if (error) {
    throw mapRpcError(
      error
    );
  }

  const row =
    normalizeIntentRow(
      firstRpcRow(
        data
      )
    );

  if (
    row.status !==
      "paid" ||
    !row.wallet_transaction_id ||
    !Number.isSafeInteger(
      row.wallet_balance_after
    ) ||
    row.wallet_balance_after <
      0
  ) {
    throw createPosPaymentError({
      message:
        "Kết quả thanh toán Cing Wallet không hợp lệ",
      code:
        "CING_WALLET_POS_SETTLEMENT_RESULT_INVALID",
      statusCode:
        500,
    });
  }

  return {
    applied:
      row.applied,

    intent_id:
      row.intent_id,

    wallet_transaction_id:
      row.wallet_transaction_id,

    amount:
      row.amount,

    wallet_balance_after:
      row.wallet_balance_after,

    status:
      row.status,

    paid_at:
      row.paid_at,
  };
}


module.exports = {
  CAPABILITY_PREFIX,
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
  createPosPaymentError,
  safeEqualText,
  assertPosEpaymentEnabled,
  assertIposEpaymentCredential,
  normalizeAmount,
  normalizeTtlSeconds,
  buildProviderRequestKey,
  createQrCapability,
  verifyQrCapability,
  resolveCustomerUserId,
  mapRpcError,
  createIposPosPayment,
  queryIposPosPayment,
  previewCustomerPosPayment,
  confirmCustomerPosPayment,
};
