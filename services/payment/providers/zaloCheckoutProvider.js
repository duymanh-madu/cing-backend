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
};

function buildDataMac(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function createMac(params) {
  if (!ZALO_CHECKOUT_CONFIG.privateKey) {
    throw new Error("Missing ZALO_CHECKOUT_PRIVATE_KEY");
  }

  const dataMac = buildDataMac(params);

  return crypto
    .createHmac("sha256", ZALO_CHECKOUT_CONFIG.privateKey.trim())
    .update(dataMac)
    .digest("hex");
}

function normalizeItems(cartSnapshot, amount) {
  // Checkout SDK yêu cầu item là bắt buộc.
  // Đơn thật có thể có phí ship/giảm giá/điểm/tier discount, nên item gửi Zalo
  // phải khớp tổng thanh toán cuối cùng, không chỉ tổng giá món.
  const total = Math.max(0, Math.round(Number(amount || 0)));

  return [
    {
      id: "order-total",
      amount: total,
    },
  ];
}

async function createPayment({
  transactionCode,
  amount,
  description,
  cartSnapshot,
}) {
  const numericAmount = Number(amount || 0);
  const item = normalizeItems(cartSnapshot, numericAmount);

  const extradata = JSON.stringify({
    storeName: process.env.ZALO_CHECKOUT_STORE_NAME || "Cing Hu Tang Kinh Bắc",
    storeId: process.env.ZALO_CHECKOUT_STORE_ID || "cing-kinh-bac",
    orderGroupId: transactionCode,
    transaction_code: transactionCode,
  });

  const method = JSON.stringify({
    id: process.env.ZALO_CHECKOUT_METHOD_ID || "MOMO",
    isCustom: false,
  });

  const paramsForMac = {
    amount: numericAmount,
    desc: description || `Thanh toán đơn hàng ${transactionCode}`,
    extradata,
    item: JSON.stringify(item),
    method,
  };

  const dataMac = buildDataMac(paramsForMac);
  const mac = createMac(paramsForMac);

  return {
    provider: "zalo_checkout",
    providerTransactionId: transactionCode,
    paymentUrl: null,
    qrContent: null,
    raw: {
      appId: ZALO_CHECKOUT_CONFIG.appId,
      orderId: transactionCode,
      amount: numericAmount,
      desc: paramsForMac.desc,
      item,
      extradata,
      method,
      mac,
      dataMac,
      // redirectPath dùng cấu hình trên Zalo Portal; không gửi trong order payload.
    },
  };
}

module.exports = {
  createPayment,
};
