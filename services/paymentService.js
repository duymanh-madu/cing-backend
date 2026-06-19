const crypto = require("crypto");
const axios = require("axios");

const supabase =
  require("../supabase");

const {
  createOrder,
} = require("./orderService");

const {
  createNotification,
} = require("./notificationService");

const {
  pushOrderToIPOS,
} = require("./iposOrderService");

/**
 * =====================================================
 * MOMO CONFIG
 * =====================================================
 */

const MOMO_CONFIG = {

  endpoint:
    process.env.MOMO_ENDPOINT ||
    "https://test-payment.momo.vn/v2/gateway/api/create",

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

/**
 * =====================================================
 * VALIDATE ENV
 * =====================================================
 */

if (
  !MOMO_CONFIG.partnerCode ||
  !MOMO_CONFIG.accessKey ||
  !MOMO_CONFIG.secretKey
) {

  console.warn(
    "MOMO ENV NOT FULLY CONFIGURED"
  );

}

/**
 * =====================================================
 * GENERATE TRANSACTION CODE
 * =====================================================
 */

function generateTransactionCode() {

  const timestamp =
    Date.now();

  const random =
    crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase();

  return `PAY-${timestamp}-${random}`;

}

/**
 * =====================================================
 * GENERATE BANK CONTENT
 * =====================================================
 */

function generateBankTransferContent({
  transaction_code,
}) {

  return `CINGHU-${transaction_code}`;

}

/**
 * =====================================================
 * GENERATE SIGNATURE
 * =====================================================
 */

function generateMomoSignature(
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

/**
 * =====================================================
 * CREATE MOMO PAYMENT
 * =====================================================
 */

function normalizeOrderType(value, shippingAddress = "") {
  const raw = String(value || "").trim().toLowerCase();

  if (["delivery", "deli", "ship", "shipping"].includes(raw)) return "delivery";
  if (["dine_in", "dinein", "dine-in", "dine", "store", "at_store", "table", "eat_in", "eat-in", "eat_here", "tai_quan", "tại quán", "tai quan", "an_tai_quan", "ăn tại quán", "an tai quan"].includes(raw)) return "dine_in";
  if (["pickup", "takeaway", "take_away", "takeout", "mang_ve", "mang về", "mang ve"].includes(raw)) return "pickup";

  return String(shippingAddress || "").trim() ? "delivery" : "pickup";
}

function resolveOrderType(payload = {}) {
  return normalizeOrderType(
    payload.order_type ||
    payload.orderType ||
    payload.fulfillment_type ||
    payload.fulfillmentType ||
    payload.cart_snapshot?.order_type ||
    payload.cart_snapshot?.orderType ||
    payload.cart_snapshot?.fulfillment_type ||
    payload.cart_snapshot?.fulfillmentType,
    payload.shipping_address || payload.cart_snapshot?.shipping_address || ""
  );
}


async function createMomoPayment({

  transaction_code,

  amount,

  orderInfo,

}) {

  const requestId =
    `${transaction_code}-${Date.now()}`;

  const orderId =
    transaction_code;

  const rawSignature =

    `accessKey=${MOMO_CONFIG.accessKey}` +
    `&amount=${amount}` +
    `&extraData=` +
    `&ipnUrl=${MOMO_CONFIG.ipnUrl}` +
    `&orderId=${orderId}` +
    `&orderInfo=${orderInfo}` +
    `&partnerCode=${MOMO_CONFIG.partnerCode}` +
    `&redirectUrl=${MOMO_CONFIG.redirectUrl}` +
    `&requestId=${requestId}` +
    `&requestType=captureWallet`;

  const signature =
    generateMomoSignature(
      rawSignature
    );

  const requestBody = {

    partnerCode:
      MOMO_CONFIG.partnerCode,

    accessKey:
      MOMO_CONFIG.accessKey,

    requestId,

    amount:
      String(amount),

    orderId,

    orderInfo,

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

  console.log(
    "MOMO REQUEST:",
    requestBody
  );

  const response =
    await axios.post(
      MOMO_CONFIG.endpoint,
      requestBody,
      {
        timeout: 15000,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );

  console.log(
    "MOMO RESPONSE:",
    response.data
  );

  return response.data;

}

/**
 * =====================================================
 * CREATE PAYMENT SESSION
 * =====================================================
 */

async function createPaymentSession({

  user_id,

  customer_name,

  customer_phone,

  payment_provider,

  payment_method,

  cart_snapshot,

  subtotal,

  shipping_fee,

  total_amount,

  shipping_address,

  order_type,

  orderType,

  fulfillment_type,

  fulfillmentType,


  shipping_distance,

}) {

  /**
   * VALIDATE
   */

  if (
    !payment_provider ||
    !payment_method ||
    !total_amount
  ) {

    throw new Error(
      "Missing payment data"
    );

  }

  /**
   * TRANSACTION
   */

  const transaction_code =
    generateTransactionCode();

  /**
   * EXPIRE
   */

  const expired_at =
    new Date(
      Date.now() +
      1000 * 60 * 15
    ).toISOString();

  /**
   * BANK CONTENT
   */

  const qr_content =
    generateBankTransferContent({
      transaction_code,
    });

  /**
   * CREATE DB
   */

  const {
    data,
    error,
  } = await supabase

    .from(
      "payment_transactions"
    )

    .insert({

      user_id:
        user_id || null,

      transaction_code,

      payment_provider,

      payment_method,

      amount:
        total_amount,

      payment_status:
        "pending",

      payment_session_status:
        "created",

      qr_code:
        qr_content,

      cart_snapshot: {

        customer_name,

        customer_phone,

        items:
          cart_snapshot?.items || [],

        subtotal,

        shipping_fee,

        shipping_address,

        order_type:
          resolveOrderType({
            order_type,
            orderType,
            fulfillment_type,
            fulfillmentType,
            shipping_address,
            cart_snapshot,
          }),

        shipping_distance,

      },

      expired_at,

    })

    .select()

    .single();

  if (error) {

    throw new Error(
      error.message
    );

  }

  /**
   * MOMO
   */

  let momoPayment =
    null;

  if (
    payment_provider ===
    "momo"
  ) {

    try {

      momoPayment =
        await createMomoPayment({

          transaction_code,

          amount:
            total_amount,

          orderInfo:
            `Thanh toán đơn hàng ${transaction_code}`,

        });

      /**
       * VALIDATE MOMO
       */

      if (
        !momoPayment ||
        momoPayment.resultCode !== 0
      ) {

        console.log(
          "MOMO ERROR:",
          momoPayment
        );

        throw new Error(
          momoPayment?.message ||
          "MoMo gateway failed"
        );

      }

      /**
       * SAVE MOMO RESPONSE
       */

      await supabase

        .from(
          "payment_transactions"
        )

        .update({

          provider_transaction_id:
            momoPayment.requestId,

          provider_response:
            momoPayment,

        })

        .eq(
          "id",
          data.id
        );

    } catch (momoError) {

      console.log(
        "MOMO CREATE ERROR:",
        momoError?.response?.data ||
        momoError.message
      );

      /**
       * UPDATE FAILED
       */

      await supabase

        .from(
          "payment_transactions"
        )

        .update({

          payment_status:
            "failed",

          payment_session_status:
            "failed",

        })

        .eq(
          "id",
          data.id
        );

      throw new Error(
        "Không thể tạo thanh toán MoMo"
      );

    }

  }

  /**
   * RETURN
   */

  return {

    success: true,

    payment: data,

    paymentUrl:
  momoPayment?.payUrl ||
  momoPayment?.shortLink ||
  null,

    deeplink:
      momoPayment?.deeplink || null,

    qrCodeUrl:
      momoPayment?.qrCodeUrl || null,

    momo:
      momoPayment || null,

    bank_transfer: {

      amount:
        total_amount,

      content:
        qr_content,

      expired_at,

    },

  };

}

/**
 * =====================================================
 * VERIFY PAYMENT
 * =====================================================
 */

async function verifyPayment({

  transaction_code,

  provider_transaction_id,

}) {

  const {
    data: payment,
    error,
  } = await supabase

    .from(
      "payment_transactions"
    )

    .select("*")

    .eq(
      "transaction_code",
      transaction_code
    )

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  if (!payment) {

    throw new Error(
      "Payment not found"
    );

  }

  if (
    payment.payment_status ===
    "paid"
  ) {

    return {
  success: true,

  payment: data,

  paymentUrl:
    momoPayment?.payUrl || null,

  deeplink:
    momoPayment?.deeplink || null,

  qrCodeUrl:
    momoPayment?.qrCodeUrl || null,

  momo:
    momoPayment || null,

  bank_transfer: {
    amount: total_amount,

    content: qr_content,

    expired_at,
  },
};

  }

  /**
   * UPDATE PAYMENT
   */

  const {
    data: updated,
    error: updateError,
  } = await supabase

    .from(
      "payment_transactions"
    )

    .update({

      payment_status:
        "paid",

      payment_session_status:
        "completed",

      provider_transaction_id,

      paid_at:
        new Date().toISOString(),

    })

    .eq(
      "id",
      payment.id
    )

    .select()

    .single();

  if (updateError) {

    throw new Error(
      updateError.message
    );

  }

  /**
   * CREATE ORDER
   */

  const orderResult =
    await createOrder({

      user_id:
        payment.user_id,

      items:
        payment.cart_snapshot?.items || [],

      subtotal:
        payment.cart_snapshot?.subtotal || 0,

      shipping_fee:
        payment.cart_snapshot?.shipping_fee || 0,

      total:
        payment.amount,

      payment_status:
        "paid",

      payment_method:
        payment.payment_method,

      payment_transaction_id:
        payment.id,

    });

  /**
   * PUSH IPOS
   */

  try {

    await pushOrderToIPOS({
      order:
        orderResult.order,
    });

  } catch (err) {

    console.log(
      "IPOS ERROR:",
      err.message
    );

  }

  /**
   * NOTIFICATION
   */

  try {

    await createNotification({

      user_id:
        payment.user_id,

      notification_type:
        "payment_success",

      title:
        "Thanh toán thành công",

      message:
        `Đơn hàng ${orderResult.order.order_code} đã được xác nhận.`,

      metadata: {

        order_id:
          orderResult.order.id,

      },

    });

  } catch (err) {

    console.log(
      "NOTIFICATION ERROR:",
      err.message
    );

  }

  return {

    success: true,

    payment:
      updated,

    order:
      orderResult.order,

  };

}

/**
 * =====================================================
 * EXPIRE PAYMENTS
 * =====================================================
 */

async function expireOldPayments() {

  const {
    error,
  } = await supabase

    .from(
      "payment_transactions"
    )

    .update({

      payment_status:
        "expired",

    })

    .eq(
      "payment_status",
      "pending"
    )

    .lt(
      "expired_at",
      new Date().toISOString()
    );

  if (error) {

    throw new Error(
      error.message
    );

  }

  return true;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  createPaymentSession,

  verifyPayment,

  expireOldPayments,

};