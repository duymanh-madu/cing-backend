const crypto = require("crypto");

const ZALO_CHECKOUT_CONFIG = {
  appId:
    process.env.ZALO_CHECKOUT_APP_ID ||
    process.env.ZALO_APP_ID ||
    "",

  privateKey:
    process.env.ZALO_CHECKOUT_PRIVATE_KEY ||
    process.env.ZALO_PRIVATE_KEY ||
    "",

  redirectPath:
    process.env.ZALO_CHECKOUT_REDIRECT_PATH ||
    "momo",
};

function createMac(data) {
  if (!ZALO_CHECKOUT_CONFIG.privateKey) {
    throw new Error("Missing ZALO_CHECKOUT_PRIVATE_KEY");
  }

  const rawData =
    Object.keys(data)
      .sort()
      .map(k => `${k}=${data[k]}`)
      .join("&");

  return crypto
    .createHmac("sha256", ZALO_CHECKOUT_CONFIG.privateKey)
    .update(rawData)
    .digest("hex");
}

async function createPayment({
  transactionCode,
  amount,
  description,
}) {
  const order = {
    appId: ZALO_CHECKOUT_CONFIG.appId,
    orderId: transactionCode,
    amount: Number(amount),
    description: description || `Thanh toán đơn hàng ${transactionCode}`,
    item: [],
    extraData: "",
    redirectPath: ZALO_CHECKOUT_CONFIG.redirectPath,
  };

  const mac = createMac(order);

  return {
    provider: "zalo_checkout",
    providerTransactionId: transactionCode,
    paymentUrl: null,
    qrContent: null,
    raw: {
      ...order,
      mac,
    },
  };
}

module.exports = {
  createPayment,
};
