const crypto =
  require("crypto");

const supabase =
  require("../supabase");

const {
  createOrder,
} = require(
  "./orderService"
);

const {
  createNotification,
} = require(
  "./notificationService"
);

const {
  pushOrderToIPOS,
} = require(
  "./iposOrderService"
);

/**
 * ============================================
 * GENERATE TRANSACTION CODE
 * ============================================
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
 * ============================================
 * GENERATE BANK QR CONTENT
 * ============================================
 */

function generateBankTransferContent({

  transaction_code,

}) {

  return `CINGHU-${transaction_code}`;

}

/**
 * ============================================
 * CREATE PAYMENT SESSION
 * ============================================
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

  shipping_distance,

}) {

  /**
   * VALIDATE
   */

  if (
    !user_id ||
    !payment_provider ||
    !payment_method
  ) {

    throw new Error(
      "Missing payment data"
    );

  }

  /**
   * DUPLICATE PAYMENT CHECK
   */

  const {

    data: existing,

  } = await supabase

    .from(
      "payment_transactions"
    )

    .select("*")

    .eq(
      "user_id",
      user_id
    )

    .eq(
      "payment_status",
      "pending"
    )

    .gte(
      "created_at",
      new Date(
        Date.now() -
          1000 * 60 * 5
      ).toISOString()
    )

    .limit(1)

    .maybeSingle();

  /**
   * REUSE PENDING SESSION
   */

  if (existing) {

    return {

      success: true,

      reused: true,

      payment:
        existing,

    };

  }

  /**
   * GENERATE CODE
   */

  const transaction_code =

    generateTransactionCode();

  /**
   * EXPIRE TIME
   */

  const expired_at =
    new Date(
      Date.now() +
        1000 *
          60 *
          15
    ).toISOString();

  /**
   * BANK CONTENT
   */

  const qr_content =

    generateBankTransferContent({

      transaction_code,

    });

  /**
   * CREATE PAYMENT
   */

  const {

    data,
    error,

  } = await supabase

    .from(
      "payment_transactions"
    )

    .insert({

      user_id,

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

      cart_snapshot,

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
   * RETURN SESSION
   */

  return {

    success: true,

    payment: data,

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
 * ============================================
 * VERIFY PAYMENT
 * ============================================
 */

async function verifyPayment({

  transaction_code,

  provider_transaction_id,

}) {

  /**
   * FIND PAYMENT
   */

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

  /**
   * ALREADY PAID
   */

  if (
    payment.payment_status ===
    "paid"
  ) {

    return {

      success: true,

      duplicated: true,

      payment,

    };

  }

  /**
   * EXPIRED
   */

  if (
    new Date(
      payment.expired_at
    ) < new Date()
  ) {

    throw new Error(
      "Payment expired"
    );

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

      callback_received:
        true,

      webhook_verified:
        true,

      paid_at:
        new Date()
          .toISOString(),

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

      customer_name:
        payment
          .cart_snapshot
          ?.customer_name,

      customer_phone:
        payment
          .cart_snapshot
          ?.customer_phone,

      items:
        payment
          .cart_snapshot
          ?.items || [],

      subtotal:
        payment
          .cart_snapshot
          ?.subtotal || 0,

      shipping_fee:
        payment
          .cart_snapshot
          ?.shipping_fee || 0,

      total:
        payment.amount,

      shipping_address:
        payment
          .cart_snapshot
          ?.shipping_address,

      shipping_distance:
        payment
          .cart_snapshot
          ?.shipping_distance,

      payment_status:
        "paid",

      payment_method:
        payment.payment_method,

      payment_transaction_id:
        payment.id,

    });

  /**
   * UPDATE PAYMENT -> ORDER
   */

  await supabase

    .from(
      "payment_transactions"
    )

    .update({

      order_created:
        true,

      order_id:
        orderResult.order.id,

    })

    .eq(
      "id",
      payment.id
    );

    /**
 * PUSH ORDER TO IPOS
 */

try {

  await pushOrderToIPOS({

    order:
      orderResult.order,

  });

} catch (iposError) {

  console.log(

    "iPOS push error:",

    iposError.message

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
      "Notification error:",
      err.message
    );

  }

  /**
   * RETURN
   */

  return {

    success: true,

    payment:
      updated,

    order:
      orderResult.order,

  };

}

/**
 * ============================================
 * EXPIRE OLD PAYMENTS
 * ============================================
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
      new Date()
        .toISOString()
    );

  if (error) {

    throw new Error(
      error.message
    );

  }

  return true;

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  createPaymentSession,

  verifyPayment,

  expireOldPayments,

};