const {
  processVoucherUsage,
} = require(
  "./orderVoucherService"
);

const {
  processOrderReward,
} = require(
  "./orderRewardService"
);

const {
  sendOrderNotification,
} = require(
  "./orderNotificationService"
);

const {
  processCampaignOrder,
} = require(
  "./orderCampaignService"
);

const {
  emitOrderCreated,
} = require(
  "./orderRealtimeService"
);

const {
  trackOrderCreated,
} = require(
  "./orderAnalyticsService"
);

async function orchestrateOrderCreated({

  order,

  validated_voucher,

  voucher_discount,

  campaign_key,

  customer_name,

  subtotal,

}) {

  await Promise.allSettled([

    processVoucherUsage({

      validated_voucher,

      order,

      voucher_discount,

    }),

    processOrderReward({

      user_id:
        order.user_id,

      subtotal,

      payment_status:
        order.payment_status,

    }),

    sendOrderNotification({

      user_id:
        order.user_id,

      order,

    }),

    processCampaignOrder({

      campaign_key,

      user_id:
        order.user_id,

      customer_name,

      subtotal,

    }),

    emitOrderCreated({

      order,

    }),

    trackOrderCreated({

      order,

    }),

  ]);

}

module.exports = {

  orchestrateOrderCreated,

};