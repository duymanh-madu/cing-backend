const crypto =
  require("crypto");

const MOMO_ACCESS_KEY =
  process.env.MOMO_ACCESS_KEY ||
  "";

const MOMO_SECRET_KEY =
  process.env.MOMO_SECRET_KEY ||
  "";

const MOMO_PARTNER_CODE =
  process.env.MOMO_PARTNER_CODE ||
  "";

function requireNonEmpty(
  value,
  field
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    throw new Error(
      `MOMO_SETTLEMENT_${field.toUpperCase()}_REQUIRED`
    );
  }

  return String(value);
}

function normalizeMomoIpnPayload(
  payload
) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new Error(
      "MOMO_SETTLEMENT_PAYLOAD_INVALID"
    );
  }

  return {
    partnerCode:
      requireNonEmpty(
        payload.partnerCode,
        "partnerCode"
      ),

    orderId:
      requireNonEmpty(
        payload.orderId,
        "orderId"
      ),

    requestId:
      requireNonEmpty(
        payload.requestId,
        "requestId"
      ),

    amount:
      requireNonEmpty(
        payload.amount,
        "amount"
      ),

    orderInfo:
      requireNonEmpty(
        payload.orderInfo,
        "orderInfo"
      ),

    orderType:
      requireNonEmpty(
        payload.orderType,
        "orderType"
      ),

    transId:
      requireNonEmpty(
        payload.transId,
        "transId"
      ),

    resultCode:
      requireNonEmpty(
        payload.resultCode,
        "resultCode"
      ),

    message:
      payload.message === null ||
      payload.message === undefined
        ? ""
        : String(payload.message),

    payType:
      requireNonEmpty(
        payload.payType,
        "payType"
      ),

    responseTime:
      requireNonEmpty(
        payload.responseTime,
        "responseTime"
      ),

    extraData:
      payload.extraData === null ||
      payload.extraData === undefined
        ? ""
        : String(payload.extraData),

    signature:
      requireNonEmpty(
        payload.signature,
        "signature"
      ),
  };
}

function buildMomoIpnRawSignature({
  accessKey,
  payload,
}) {
  return (
    `accessKey=${accessKey}` +
    `&amount=${payload.amount}` +
    `&extraData=${payload.extraData}` +
    `&message=${payload.message}` +
    `&orderId=${payload.orderId}` +
    `&orderInfo=${payload.orderInfo}` +
    `&orderType=${payload.orderType}` +
    `&partnerCode=${payload.partnerCode}` +
    `&payType=${payload.payType}` +
    `&requestId=${payload.requestId}` +
    `&responseTime=${payload.responseTime}` +
    `&resultCode=${payload.resultCode}` +
    `&transId=${payload.transId}`
  );
}

function createMomoIpnSignature({
  secretKey,
  rawSignature,
}) {
  return crypto
    .createHmac(
      "sha256",
      secretKey
    )
    .update(rawSignature)
    .digest("hex");
}

function timingSafeHexEqual(
  left,
  right
) {
  const a =
    Buffer.from(
      String(left || ""),
      "utf8"
    );

  const b =
    Buffer.from(
      String(right || ""),
      "utf8"
    );

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    a,
    b
  );
}

function verifyMomoSettlement(
  input,
  config = {}
) {
  const accessKey =
    config.accessKey ||
    MOMO_ACCESS_KEY;

  const secretKey =
    config.secretKey ||
    MOMO_SECRET_KEY;

  const partnerCode =
    config.partnerCode ||
    MOMO_PARTNER_CODE;

  if (!accessKey) {
    throw new Error(
      "MOMO_SETTLEMENT_ACCESS_KEY_MISSING"
    );
  }

  if (!secretKey) {
    throw new Error(
      "MOMO_SETTLEMENT_SECRET_KEY_MISSING"
    );
  }

  if (!partnerCode) {
    throw new Error(
      "MOMO_SETTLEMENT_PARTNER_CODE_MISSING"
    );
  }

  const payload =
    normalizeMomoIpnPayload(
      input
    );

  if (
    payload.partnerCode !==
    partnerCode
  ) {
    throw new Error(
      "MOMO_SETTLEMENT_PARTNER_CODE_MISMATCH"
    );
  }

  const rawSignature =
    buildMomoIpnRawSignature({
      accessKey,
      payload,
    });

  const expectedSignature =
    createMomoIpnSignature({
      secretKey,
      rawSignature,
    });

  if (
    !timingSafeHexEqual(
      expectedSignature,
      payload.signature
    )
  ) {
    throw new Error(
      "MOMO_SETTLEMENT_SIGNATURE_INVALID"
    );
  }

  const amount =
    Number(payload.amount);

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "MOMO_SETTLEMENT_AMOUNT_INVALID"
    );
  }

  const resultCode =
    Number(payload.resultCode);

  if (
    !Number.isSafeInteger(
      resultCode
    )
  ) {
    throw new Error(
      "MOMO_SETTLEMENT_RESULT_CODE_INVALID"
    );
  }

  return {
    provider:
      "momo",

    transactionCode:
      payload.orderId,

    providerTransactionId:
      payload.transId,

    amount,

    resultCode,

    succeeded:
      resultCode === 0,

    verificationMethod:
      "momo_hmac_sha256",

    settlementReference:
      payload.transId,

    payload,
  };
}

module.exports = {
  normalizeMomoIpnPayload,
  buildMomoIpnRawSignature,
  createMomoIpnSignature,
  timingSafeHexEqual,
  verifyMomoSettlement,
};
