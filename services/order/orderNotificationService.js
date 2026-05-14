const {
  createNotification,
} = require(
  "../notificationService"
);

async function sendOrderNotification({

  user_id,

  order,

}) {

  try {

    await createNotification({

      user_id,

      title:
        "🛍️ Đặt hàng thành công",

      message:

        `Đơn hàng ${order.order_code} đã được tạo thành công`,

      type:
        "order_success",

      notification_type:
        "order_success",

      action_url:
        "/orders",

    });

  } catch (error) {

    console.error(

      "sendOrderNotification error:",

      error.message

    );

  }

}

module.exports = {

  sendOrderNotification,

};