const {
  createNotification,
} = require(
  "../../notificationService"
);

const {
  pushOrderToIPOS,
} = require(
  "../../iposOrderService"
);

async function paymentPaidListener(
  payload
) {

  try {

    if (
      payload?.order
    ) {

      await pushOrderToIPOS({

        order:
          payload.order,

      });

    }

  } catch (error) {

    console.log(
      "IPOS PUSH ERROR:",
      error.message
    );

  }

  try {

    await createNotification({

      user_id:
        payload.user_id,

      notification_type:
        "payment_success",

      title:
        "Thanh toán thành công",

      message:
        `Thanh toán ${payload.transaction_code} thành công`,

      metadata: {

        order_id:
          payload?.order?.id,

      },

    });

  } catch (error) {

    console.log(
      "NOTIFICATION ERROR:",
      error.message
    );

  }

}

module.exports =
  paymentPaidListener;