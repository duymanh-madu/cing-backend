const crypto =
  require("crypto");

const axios =
  require("axios");


const DEFAULT_ENDPOINT =
  "https://payment-mini.zalo.me/api/transaction/get-status";


function requiredConfig(
  name,
  env = process.env
) {
  const value =
    String(
      env?.[name] || ""
    ).trim();

  if (!value) {
    throw new Error(
      `${name}_REQUIRED`
    );
  }

  return value;
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
      "ZALO_CHECKOUT_QUERY_AMOUNT_INVALID"
    );
  }

  return amount;
}


function createZaloCheckoutStatusMac({
  appId,
  orderId,
  privateKey,
}) {
  const data =
    `appId=${appId}` +
    `&orderId=${orderId}` +
    `&privateKey=${privateKey}`;

  return crypto
    .createHmac(
      "sha256",
      privateKey
    )
    .update(data)
    .digest("hex");
}


function classifyZaloCheckoutStatus(
  returnCode
) {
  if (returnCode === 1) {
    return "success";
  }

  if (returnCode === -1) {
    return "terminal_failure";
  }

  if (returnCode === 0) {
    return "pending";
  }

  /*
   * Unknown provider states must not become
   * financial success or terminal failure.
   *
   * They remain retryable for later authoritative
   * provider reconciliation.
   */
  return "pending";
}


function validateZaloCheckoutStatusResponse({
  response,
  expectedOrderId,
  expectedAmount,
}) {
  if (
    !response ||
    typeof response !== "object"
  ) {
    throw new Error(
      "ZALO_CHECKOUT_QUERY_RESPONSE_INVALID"
    );
  }

  const returnCode =
    Number(
      response.returnCode
    );

  if (
    !Number.isSafeInteger(
      returnCode
    )
  ) {
    throw new Error(
      "ZALO_CHECKOUT_QUERY_RETURN_CODE_INVALID"
    );
  }

  const classification =
    classifyZaloCheckoutStatus(
      returnCode
    );

  const responseAmount =
    Number(
      response.amount
    );

  /*
   * Any authoritative success must bind back to the
   * backend-owned canonical amount.
   */
  if (
    classification ===
      "success" &&
    (
      !Number.isSafeInteger(
        responseAmount
      ) ||
      responseAmount !==
        expectedAmount
    )
  ) {
    throw new Error(
      "ZALO_CHECKOUT_QUERY_AMOUNT_MISMATCH"
    );
  }

  const merchantTransId =
    response.merchantTransId ===
      undefined ||
    response.merchantTransId ===
      null
      ? ""
      : String(
          response.merchantTransId
        ).trim();

  /*
   * Zalo documents merchantTransId as the merchant
   * transaction identity. If returned, it must refer
   * to the canonical payment transaction.
   */
  if (
    merchantTransId &&
    merchantTransId !==
      expectedOrderId
  ) {
    throw new Error(
      "ZALO_CHECKOUT_QUERY_MERCHANT_TRANSACTION_MISMATCH"
    );
  }

  const transId =
    response.transId ===
      undefined ||
    response.transId ===
      null
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
      "ZALO_CHECKOUT_QUERY_SUCCESS_TRANS_ID_REQUIRED"
    );
  }

  return {
    resultCode:
      returnCode,

    classification,

    amount:
      Number.isSafeInteger(
        responseAmount
      )
        ? responseAmount
        : expectedAmount,

    providerTransactionId:
      transId || null,

    message:
      String(
        response.returnMessage ||
        ""
      ),

    merchantTransId:
      merchantTransId ||
      null,

    transTime:
      response.transTime ??
      null,

    raw:
      response,
  };
}


async function queryZaloCheckoutTransaction({
  transactionCode,
  amount,
  env = process.env,
  httpClient = axios,
}) {
  const orderId =
    String(
      transactionCode || ""
    ).trim();

  if (!orderId) {
    throw new Error(
      "ZALO_CHECKOUT_QUERY_ORDER_ID_REQUIRED"
    );
  }

  const expectedAmount =
    normalizeWholeVnd(
      amount
    );

  const appId =
    String(
      env.ZALO_CHECKOUT_APP_ID ||
      env.ZALO_APP_ID ||
      ""
    ).trim();

  if (!appId) {
    throw new Error(
      "ZALO_CHECKOUT_APP_ID_REQUIRED"
    );
  }

  const privateKey =
    String(
      env.ZALO_CHECKOUT_PRIVATE_KEY ||
      env.ZALO_PRIVATE_KEY ||
      ""
    ).trim();

  if (!privateKey) {
    throw new Error(
      "ZALO_CHECKOUT_PRIVATE_KEY_REQUIRED"
    );
  }

  const endpoint =
    String(
      env.ZALO_CHECKOUT_STATUS_ENDPOINT ||
      DEFAULT_ENDPOINT
    ).trim();

  const mac =
    createZaloCheckoutStatusMac({
      appId,
      orderId,
      privateKey,
    });

  const response =
    await httpClient.get(
      endpoint,
      {
        timeout:
          35000,

        params: {
          appId,
          orderId,
          mac,
        },
      }
    );

  return {
    orderId,

    ...validateZaloCheckoutStatusResponse({
      response:
        response.data,

      expectedOrderId:
        orderId,

      expectedAmount,
    }),
  };
}


module.exports = {
  DEFAULT_ENDPOINT,
  createZaloCheckoutStatusMac,
  classifyZaloCheckoutStatus,
  validateZaloCheckoutStatusResponse,
  queryZaloCheckoutTransaction,
};
