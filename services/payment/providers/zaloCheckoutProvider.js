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

function createMac(params) {
  if (!ZALO_CHECKOUT_CONFIG.privateKey) {
    throw new Error("Missing ZALO_CHECKOUT_PRIVATE_KEY");
  }

  const dataMac = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHmac("sha256", ZALO_CHECKOUT_CONFIG.privateKey)
    .update(dataMac)
    .digest("hex");
}

function normalizeItems(cartSnapshot, amount) {
  const rawItems = Array.isArray(cartSnapshot?.items)
    ? cartSnapshot.items
    : [];

  const items = rawItems
    .map((i, idx) => {
      const qty = Number(i.qty || i.quantity || 1);
      const price = Number(i.price || 0);
      return {
        id: String(i.item_id || i.id || i.code || `item-${idx + 1}`),
        amount: Math.max(0, Math.round(price * qty)),
      };
    })
    .filter(i => i.amount > 0);

  if (items.length > 0) return items;

  return [{ id: "order-total", amount: Number(amount || 0) }];
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
    transaction_code: transactionCode,
    redirectPath: "/order-success",
  });

  const method = JSON.stringify({
    id: "MOMO",
    isCustom: false,
  });

  const paramsForMac = {
    amount: numericAmount,
    desc: description || `Thanh toán đơn hàng ${transactionCode}`,
    extradata,
    item: JSON.stringify(item),
    method,
  };

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
      redirectPath: "/order-success",
    },
  };
}

module.exports = {
  createPayment,
};
