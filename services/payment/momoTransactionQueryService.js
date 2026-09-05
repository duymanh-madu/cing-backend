const crypto =
  require("crypto");

const axios =
  require("axios");


const NON_FINAL_RESULT_CODES =
  new Set([
    10,
    11,
    12,
    13,
    20,
    21,
    22,
    40,
    41,
    42,
    43,
    47,
    1000,
    7000,
    7002,
    9000,
  ]);


const FINAL_FAILURE_RESULT_CODES =
  new Set([
    98,
    99,
    1001,
    1002,
    1003,
    1004,
    1005,
    1006,
    1007,
    1017,
    1026,
    2019,
    4001,
    4002,
    4100,
  ]);


function requiredConfig(
  name
) {
  const value =
    String(
      process.env[name] || ""
    ).trim();

  if (!value) {
    throw new Error(
      `${name}_REQUIRED`
    );
  }

  return value;
}


function resolveQueryEndpoint() {
  const explicit =
    String(
      process.env.MOMO_QUERY_ENDPOINT ||
      ""
    ).trim();

  if (explicit) {
    return explicit;
  }

  const createEndpoint =
    String(
      process.env.MOMO_ENDPOINT ||
      ""
    ).trim();

  if (
    createEndpoint &&
    /\/create\/?$/.test(
      createEndpoint
    )
  ) {
    return createEndpoint.replace(
      /\/create\/?$/,
      "/query"
    );
  }

  throw new Error(
    "MOMO_QUERY_ENDPOINT_REQUIRED"
  );
}


function createQuerySignature({
  accessKey,
  orderId,
  partnerCode,
  requestId,
  secretKey,
}) {
  const rawSignature =
    `accessKey=${accessKey}` +
    `&orderId=${orderId}` +
    `&partnerCode=${partnerCode}` +
    `&requestId=${requestId}`;

  return crypto
    .createHmac(
      "sha256",
      secretKey
    )
    .update(
      rawSignature
    )
    .digest(
      "hex"
    );
}


function normalizeWholeVnd(
  value
) {
  const amount =
    Number(value);

  if (
    !Number.isSafeInteger(
      amount
    ) ||
    amount <= 0
  ) {
    throw new Error(
      "MOMO_QUERY_AMOUNT_INVALID"
    );
  }

  return amount;
}


function normalizeResultCode(
  value
) {
  const code =
    Number(value);

  if (
    !Number.isSafeInteger(
      code
    )
  ) {
    throw new Error(
      "MOMO_QUERY_RESULT_CODE_INVALID"
    );
  }

  return code;
}


function classifyMomoQueryResult(
  resultCode
) {
  const code =
    normalizeResultCode(
      resultCode
    );

  if (code === 0) {
    return "success";
  }

  if (
    FINAL_FAILURE_RESULT_CODES
      .has(code)
  ) {
    return "terminal_failure";
  }

  if (
    NON_FINAL_RESULT_CODES
      .has(code)
  ) {
    return "retry";
  }

  /*
   * Unknown/new MoMo codes fail safe toward retry.
   * Never destroy a possibly-paid transaction merely because
   * the local code table has not learned a new provider code.
   */
  return "retry";
}


function validateQueryResponse({
  response,
  expectedOrderId,
  expectedRequestId,
  expectedAmount,
  partnerCode,
}) {
  if (
    !response ||
    typeof response !== "object" ||
    Array.isArray(response)
  ) {
    throw new Error(
      "MOMO_QUERY_RESPONSE_INVALID"
    );
  }

  if (
    String(
      response.partnerCode || ""
    ) !==
    partnerCode
  ) {
    throw new Error(
      "MOMO_QUERY_PARTNER_CODE_MISMATCH"
    );
  }

  if (
    String(
      response.orderId || ""
    ) !==
    expectedOrderId
  ) {
    throw new Error(
      "MOMO_QUERY_ORDER_ID_MISMATCH"
    );
  }

  if (
    String(
      response.requestId || ""
    ) !==
    expectedRequestId
  ) {
    throw new Error(
      "MOMO_QUERY_REQUEST_ID_MISMATCH"
    );
  }

  const resultCode =
    normalizeResultCode(
      response.resultCode
    );

  const classification =
    classifyMomoQueryResult(
      resultCode
    );

  let amount = null;

  if (
    response.amount !== null &&
    response.amount !== undefined &&
    String(
      response.amount
    ).trim() !== ""
  ) {
    amount =
      normalizeWholeVnd(
        response.amount
      );

    if (
      amount !==
      expectedAmount
    ) {
      throw new Error(
        "MOMO_QUERY_AMOUNT_MISMATCH"
      );
    }
  } else if (
    classification ===
    "success"
  ) {
    throw new Error(
      "MOMO_QUERY_SUCCESS_AMOUNT_REQUIRED"
    );
  }

  const transId =
    response.transId === null ||
    response.transId === undefined
      ? ""
      : String(
          response.transId
        ).trim();

  if (
    classification ===
      "success" &&
    !transId
  ) {
    throw new Error(
      "MOMO_QUERY_SUCCESS_TRANS_ID_REQUIRED"
    );
  }

  return {
    resultCode,
    classification,
    amount,
    providerTransactionId:
      transId || null,
    message:
      String(
        response.message ||
        ""
      ),
    responseTime:
      response.responseTime ??
      null,
    raw:
      response,
  };
}


async function queryMomoTransaction({
  transactionCode,
  amount,
}) {
  const orderId =
    String(
      transactionCode || ""
    ).trim();

  if (!orderId) {
    throw new Error(
      "MOMO_QUERY_ORDER_ID_REQUIRED"
    );
  }

  const expectedAmount =
    normalizeWholeVnd(
      amount
    );

  const partnerCode =
    requiredConfig(
      "MOMO_PARTNER_CODE"
    );

  const accessKey =
    requiredConfig(
      "MOMO_ACCESS_KEY"
    );

  const secretKey =
    requiredConfig(
      "MOMO_SECRET_KEY"
    );

  const endpoint =
    resolveQueryEndpoint();

  const requestId =
    `${orderId}-query-${crypto
      .randomBytes(12)
      .toString("hex")}`;

  const signature =
    createQuerySignature({
      accessKey,
      orderId,
      partnerCode,
      requestId,
      secretKey,
    });

  const payload = {
    partnerCode,
    requestId,
    orderId,
    lang:
      "vi",
    signature,
  };

  const response =
    await axios.post(
      endpoint,
      payload,
      {
        timeout: 35000,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );

  return {
    requestId,
    orderId,
    ...validateQueryResponse({
      response:
        response.data,
      expectedOrderId:
        orderId,
      expectedRequestId:
        requestId,
      expectedAmount,
      partnerCode,
    }),
  };
}


module.exports = {
  NON_FINAL_RESULT_CODES,
  FINAL_FAILURE_RESULT_CODES,
  createQuerySignature,
  classifyMomoQueryResult,
  validateQueryResponse,
  queryMomoTransaction,
};
