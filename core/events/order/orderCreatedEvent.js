const eventBus =
  require(
    "../eventBus"
  );

const {
  createNotification,
} = require(
  "../../../services/notificationService"
);

const {
  broadcastOrderUpdate,
  broadcastDashboardUpdate,
} = require(
  "../../../services/adminRealtimeBroadcastService"
);

eventBus.register(

  "order.created",

  async ({
    order,
    user_id,
  }) => {

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

    await broadcastOrderUpdate({

      order,

      action:
        "order_created",

    });

    await broadcastDashboardUpdate();

  }

);