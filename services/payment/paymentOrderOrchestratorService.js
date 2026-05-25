const {
  createOrder,
} = require(
  "../orderService"
);

const {
  pushOrderToIPOS,
} = require(
  "../iposOrderService"
);

const {
  createNotification,
} = require(
  "../notificationService"
);

async function executePaymentOrderPipeline({
  payment,
}) {

  const orderResult =
    await createOrder({

      user_id:
        payment.user_id,

      items:
        Array.isArray(payment.cart_snapshot) ? payment.cart_snapshot :
          (payment.cart_snapshot?.items || []),

      subtotal:
        payment.cart_snapshot?.subtotal ||
          payment.amount || 0,

      shipping_fee:
        payment.cart_snapshot
          ?.shipping_fee || 0,

      total_amount:
        payment.amount,

      payment_status:
        "paid",

      payment_method:
        payment.payment_method,

      payment_transaction_id:
        payment.id,

    });

  try {

    await pushOrderToIPOS({

      order:
        orderResult.order,

    });

  } catch (error) {

    console.log(
      "IPOS PUSH ERROR:",
      error.message
    );

  }

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

  } catch (error) {

    console.log(
      "NOTIFICATION ERROR:",
      error.message
    );

  }

  return orderResult;

}

module.exports = {

  executePaymentOrderPipeline,

};