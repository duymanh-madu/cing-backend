const crypto =
  require("crypto");

const axios =
  require("axios");

const MOMO_CONFIG = {

  endpoint:
    process.env.MOMO_ENDPOINT,

  partnerCode:
    process.env.MOMO_PARTNER_CODE,

  accessKey:
    process.env.MOMO_ACCESS_KEY,

  secretKey:
    process.env.MOMO_SECRET_KEY,

  redirectUrl:
    process.env.MOMO_REDIRECT_URL,

  ipnUrl:
    process.env.MOMO_IPN_URL,

};

function createSignature(
  rawSignature
) {

  return crypto

    .createHmac(
      "sha256",
      MOMO_CONFIG.secretKey
    )

    .update(rawSignature)

    .digest("hex");

}

async function createPayment({

  transactionCode,

  amount,

  description,

}) {

  const requestId =
    `${transactionCode}-${Date.now()}`;

  const rawSignature =

    `accessKey=${MOMO_CONFIG.accessKey}` +
    `&amount=${amount}` +
    `&extraData=` +
    `&ipnUrl=${MOMO_CONFIG.ipnUrl}` +
    `&orderId=${transactionCode}` +
    `&orderInfo=${description}` +
    `&partnerCode=${MOMO_CONFIG.partnerCode}` +
    `&redirectUrl=${MOMO_CONFIG.redirectUrl}` +
    `&requestId=${requestId}` +
    `&requestType=captureWallet`;

  const signature =
    createSignature(
      rawSignature
    );

  const payload = {

    partnerCode:
      MOMO_CONFIG.partnerCode,

    accessKey:
      MOMO_CONFIG.accessKey,

    requestId,

    amount:
      String(amount),

    orderId:
      transactionCode,

    orderInfo:
      description,

    redirectUrl:
      MOMO_CONFIG.redirectUrl,

    ipnUrl:
      MOMO_CONFIG.ipnUrl,

    requestType:
      "captureWallet",

    autoCapture:
      true,

    lang:
      "vi",

    extraData:
      "",

    signature,

  };

  console.log("[MOMO] ipnUrl:", MOMO_CONFIG.ipnUrl);
  console.log("[MOMO] endpoint:", MOMO_CONFIG.endpoint);
  const response =
    await axios.post(
      MOMO_CONFIG.endpoint,
      payload,
      {
        timeout: 15000,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );

  const result =
    response.data;

  if (
    result.resultCode !== 0
  ) {

    throw new Error(
      result.message ||
      "MoMo payment failed"
    );

  }

  return {

    provider:
      "momo",

    providerTransactionId:
      result.requestId,

    paymentUrl:
      result.payUrl ||

      result.shortLink ||

      result.deeplink ||

      null,

    raw:
      result,

  };

}

module.exports = {

  createPayment,

};