const supabase =
  require("../supabase");

const {
  updateOrderStatus,
} = require(
  "./orderStatusService"
);

const {

  broadcastDeliveryUpdate,

  broadcastDashboardUpdate,

} = require(
  "./adminRealtimeBroadcastService"
);

/**
 * ============================================
 * DELIVERY STATUS CONFIG
 * ============================================
 */

const DELIVERY_STATUS = {

  assigned:
    "Đã gán shipper",

  picked_up:
    "Đã lấy hàng",

  delivering:
    "Đang giao",

  arrived:
    "Đã đến nơi",

  completed:
    "Hoàn thành",

  cancelled:
    "Đã huỷ",

};

/**
 * ============================================
 * VALID TRANSITIONS
 * ============================================
 */

const VALID_TRANSITIONS = {

  assigned: [
    "picked_up",
    "cancelled",
  ],

  picked_up: [
    "delivering",
    "cancelled",
  ],

  delivering: [
    "arrived",
    "completed",
    "cancelled",
  ],

  arrived: [
    "completed",
  ],

  completed: [],

  cancelled: [],

};

/**
 * ============================================
 * GENERATE TRACKING CODE
 * ============================================
 */

function generateTrackingCode() {

  return `DLV-${Date.now()}`;

}

/**
 * ============================================
 * CREATE DELIVERY TRACKING
 * ============================================
 */

async function createDeliveryTracking({

  order_id,

  order_code,

  user_id,

  shipper_id,

  shipper_name,

  shipper_phone,

  destination_latitude,

  destination_longitude,

  estimated_delivery_time = null,

  metadata = {},

}) {

  /**
   * DUPLICATE CHECK
   */

  const {

    data: existing,

  } = await supabase

    .from(
      "delivery_tracking"
    )

    .select("*")

    .eq(
      "order_id",
      order_id
    )

    .maybeSingle();

  if (existing) {

    return {

      success: true,

      duplicated: true,

      tracking: existing,

    };

  }

  /**
   * TIMELINE
   */

  const delivery_timeline = [

    {

      status:
        "assigned",

      status_text:
        DELIVERY_STATUS.assigned,

      created_at:
        new Date(),

    },

  ];

  /**
   * CREATE
   */

  const {

    data,

    error,

  } = await supabase

    .from(
      "delivery_tracking"
    )

    .insert({

      order_id,

      order_code,

      user_id,

      shipper_id,

      shipper_name,

      shipper_phone,

      tracking_code:
        generateTrackingCode(),

      delivery_status:
        "assigned",

      delivery_status_text:

        DELIVERY_STATUS.assigned,

      delivery_timeline,

      destination_latitude,

      destination_longitude,

      estimated_delivery_time,

      metadata,

      created_at:
        new Date(),

      updated_at:
        new Date(),

    })

    .select("*")

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  /**
   * REALTIME
   */

  await broadcastDeliveryUpdate({

    order: data,

    action:
      "delivery_assigned",

  });

  await broadcastDashboardUpdate();

  return {

    success: true,

    tracking: data,

  };

}

/**
 * ============================================
 * UPDATE DELIVERY STATUS
 * ============================================
 */

async function updateDeliveryStatus({

  tracking_id,

  delivery_status,

  latitude = null,

  longitude = null,

  notes = null,

}) {

  /**
   * FIND TRACKING
   */

  const {

    data: tracking,

    error,

  } = await supabase

    .from(
      "delivery_tracking"
    )

    .select("*")

    .eq(
      "id",
      tracking_id
    )

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  if (!tracking) {

    throw new Error(
      "Tracking not found"
    );

  }

  /**
   * VALID STATUS
   */

  if (

    !DELIVERY_STATUS[
      delivery_status
    ]

  ) {

    throw new Error(
      "Invalid delivery status"
    );

  }

  /**
   * IDEMPOTENCY
   */

  if (

    tracking.delivery_status ===
    delivery_status

  ) {

    return {

      success: true,

      duplicated: true,

      tracking,

    };

  }

  /**
   * VALID TRANSITION
   */

  const allowed =

    VALID_TRANSITIONS[
      tracking.delivery_status
    ] || [];

  if (

    !allowed.includes(
      delivery_status
    )

  ) {

    throw new Error(

      `Invalid delivery transition: ${tracking.delivery_status} -> ${delivery_status}`

    );

  }

  /**
   * TIMELINE
   */

  const delivery_timeline =

    Array.isArray(
      tracking.delivery_timeline
    )

      ? tracking.delivery_timeline

      : [];

  delivery_timeline.push({

    status:
      delivery_status,

    status_text:

      DELIVERY_STATUS[
        delivery_status
      ],

    notes,

    latitude,

    longitude,

    created_at:
      new Date(),

  });

  /**
   * UPDATE PAYLOAD
   */

  const payload = {

    delivery_status,

    delivery_status_text:

      DELIVERY_STATUS[
        delivery_status
      ],

    delivery_timeline,

    current_latitude:
      latitude,

    current_longitude:
      longitude,

    last_location_updated_at:
      new Date(),

    updated_at:
      new Date(),

  };

  /**
   * TIMESTAMPS
   */

  switch (
    delivery_status
  ) {

    case "picked_up":

      payload.pickup_time =
        new Date();

      break;

    case "delivering":

      payload.delivering_time =
        new Date();

      break;

    case "arrived":

      payload.arrived_time =
        new Date();

      break;

    case "completed":

      payload.completed_time =
        new Date();

      break;

    case "cancelled":

      payload.cancelled_time =
        new Date();

      break;

  }

  /**
   * UPDATE
   */

  const {

    data: updated,

    error: updateError,

  } = await supabase

    .from(
      "delivery_tracking"
    )

    .update(payload)

    .eq(
      "id",
      tracking_id
    )

    .select("*")

    .maybeSingle();

  if (updateError) {

    throw new Error(
      updateError.message
    );

  }

  /**
   * ORDER STATUS SYNC
   */

  if (

    delivery_status ===
    "delivering"

  ) {

    await updateOrderStatus({

      order_id:
        updated.order_id,

      status_code:
        "delivering",

      updated_by:
        "delivery_system",

      send_notification:
        true,

    });

  }

  if (

    delivery_status ===
    "completed"

  ) {

    await updateOrderStatus({

      order_id:
        updated.order_id,

      status_code:
        "completed",

      updated_by:
        "delivery_system",

      send_notification:
        true,

    });

  }

  /**
   * REALTIME
   */

  await broadcastDeliveryUpdate({

    order: updated,

    action:
      "delivery_updated",

  });

  await broadcastDashboardUpdate();

  return {

    success: true,

    tracking: updated,

  };

}

/**
 * ============================================
 * GET TRACKING
 * ============================================
 */

async function getTracking({

  tracking_id,

  order_id,

}) {

  let query =
    supabase

      .from(
        "delivery_tracking"
      )

      .select("*");

  if (tracking_id) {

    query =
      query.eq(
        "id",
        tracking_id
      );

  }

  if (order_id) {

    query =
      query.eq(
        "order_id",
        order_id
      );

  }

  const {

    data,

    error,

  } = await query

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return {

    success: true,

    tracking: data,

  };

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  DELIVERY_STATUS,

  createDeliveryTracking,

  updateDeliveryStatus,

  getTracking,

};