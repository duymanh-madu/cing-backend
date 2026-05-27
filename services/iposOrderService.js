const axios =
  require("axios");

const supabase =
  require("../supabase");

/**
 * ============================================
 * ENV
 * ============================================
 */

const IPOS_BASE_URL =
  process.env.IPOS_BASE_URL;

const IPOS_ACCESS_TOKEN =
  process.env.IPOS_ACCESS_TOKEN;

const IPOS_POS_PARENT =
  process.env.IPOS_POS_PARENT;

const IPOS_POS_ID =
  process.env.IPOS_POS_ID;

/**
 * ============================================
 * BUILD ITEMS
 * ============================================
 */

function buildItems(
  items = []
) {

  return items.map(
    (item) => ({

      item_id:

        item.item_id ||

        item.id ||

        null,

      quantity:

        item.quantity ||

        item.qty ||

        1,

      price:
        item.price || 0,

      note:
        item.note || "",

      product_name:

        item.product_name ||

        item.name ||

        "",

    })
  );

}

/**
 * ============================================
 * BUILD PAYLOAD
 * ============================================
 */

function buildPayload(order) {
  const phone = (order.customer_phone || order.user_id || "").replace(/\D/g, "");
  return {
    foodbook_code:   (order.order_code || "").replace(/[^A-Z0-9]/g,"").slice(0,15).toUpperCase(),
    pos_id:          Number(process.env.IPOS_POS_ID),
    pos_parent:      process.env.IPOS_POS_PARENT,
    order_type:      order.order_type || "STORE",
    user_id:         phone ? "84" + phone.slice(1) : "",
    username:        order.customer_name || "Khách hàng",
    note:            order.note || "",
    to_address:      order.shipping_address || "",
    ship_price_real: order.shipping_fee || 0,
    amount:          order.subtotal || order.total_amount || 0,
    total_amount:    order.total_amount || 0,
    adapt_to_online: 1,
    return_data:     "full",
    coupon_log_id:   "",
    newuser:         0,
    PaymentInfo: {
      Payment_Method: "MOMO_ORDER_ONLINE",
      Amount:         order.total_amount || 0,
    },
    order_data_item: (order.items || []).map(item => ({
      Item_Type_Id: item.category || "DU",
      Item_Id:      String(item.item_id || item.id || ""),
      Item_Name:    item.name || item.displayName || item.product_name || "",
      Price:        item.price || 0,
      Quantity:     item.quantity || item.qty || 1,
      Note:         item.note || "",
      Discount:     0,
      Foc:          0,
      Package_Id:   "",
      Parent_Id:    "",
      Fix:          0,
    })),
  };
}

}

/**
 * ============================================
 * CREATE IPOS LOG
 * ============================================
 */

async function createIposLog({

  order_id,

  transaction_code,

  request_payload,

}) {

  try {

    const {

      data,
      error,

    } = await supabase

      .from("ipos_logs")

      .insert({

        order_id,

        transaction_code,

        sync_status:
          "pending",

        retry_count: 0,

        request_payload,

      })

      .select("*")

      .maybeSingle();

    if (error) {

      throw new Error(
        error.message
      );

    }

    return data;

  } catch (error) {

    console.error(

      "createIposLog error:",

      error.message

    );

    return null;

  }

}

/**
 * ============================================
 * UPDATE IPOS LOG
 * ============================================
 */

async function updateIposLog({

  log_id,

  updates,

}) {

  try {

    if (!log_id) {

      return;

    }

    const {

      error,

    } = await supabase

      .from("ipos_logs")

      .update({

        ...updates,

        updated_at:
          new Date(),

      })

      .eq("id", log_id);

    if (error) {

      throw new Error(
        error.message
      );

    }

  } catch (error) {

    console.error(

      "updateIposLog error:",

      error.message

    );

  }

}

/**
 * ============================================
 * CHECK DUPLICATE PUSH
 * ============================================
 */

async function checkExistingSuccess({

  order_id,

}) {

  try {

    const {

      data,
      error,

    } = await supabase

      .from("ipos_logs")

      .select("*")

      .eq(
        "order_id",
        order_id
      )

      .eq(
        "sync_status",
        "success"
      )

      .maybeSingle();

    if (error) {

      throw new Error(
        error.message
      );

    }

    return !!data;

  } catch (error) {

    console.error(

      "checkExistingSuccess error:",

      error.message

    );

    return false;

  }

}

/**
 * ============================================
 * REALTIME EMIT
 * ============================================
 */

function emitRealtime({

  event,

  payload,

}) {

  try {

    if (global.io) {

      global.io.emit(

        event,

        payload

      );

    }

  } catch (error) {

    console.error(

      "emitRealtime error:",

      error.message

    );

  }

}

/**
 * ============================================
 * PUSH ORDER TO IPOS
 * ============================================
 */

async function pushOrderToIPOS({

  order,

  transaction_code,

}) {

  /**
   * VALIDATE
   */

  if (!order) {

    throw new Error(
      "Missing order"
    );

  }

  /**
   * IDEMPOTENCY
   */

  const alreadySynced =

    await checkExistingSuccess({

      order_id:
        order.id,

    });

  if (alreadySynced) {

    return {

      success: true,

      duplicated: true,

    };

  }

  /**
   * BUILD PAYLOAD
   */

  const payload =
    buildPayload(
      order
    );

  /**
   * CREATE LOG
   */

  const log =
    await createIposLog({

      order_id:
        order.id,

      transaction_code,

      request_payload:
        payload,

    });

  try {

    /**
     * REQUEST
     */

    const response =

      await axios.post(

        `${IPOS_BASE_URL}/ipos/ws/xpartner/order_online`,

        payload,

        {

          headers: {

            Authorization:

              `Bearer ${IPOS_ACCESS_TOKEN}`,

            "Content-Type":

              "application/json",

          },

          params: {

            pos_parent:
              IPOS_POS_PARENT,

            pos_id:
              IPOS_POS_ID,

          },

          timeout: 15000,

        }

      );

    /**
     * RESPONSE DATA
     */

    const responseData =
      response.data;

    /**
     * UPDATE LOG
     */

    await updateIposLog({

      log_id:
        log?.id,

      updates: {

        sync_status:
          "success",

        response_payload:
          responseData,

        ipos_order_id:

          responseData
            ?.order_id ||

          null,

        synced_at:
          new Date(),

      },

    });

    /**
     * UPDATE ORDER
     */

    try {

      await supabase

        .from("orders")

        .update({

          pos_sync_status:
            "success",

          pos_synced_at:
            new Date(),

          updated_at:
            new Date(),

        })

        .eq(
          "id",
          order.id
        );

    } catch (orderError) {

      console.error(

        "order update error:",

        orderError.message

      );

    }

    /**
     * REALTIME
     */

    emitRealtime({

      event:
        "ipos_order_synced",

      payload: {

        order_id:
          order.id,

        transaction_code,

        sync_status:
          "success",

      },

    });

    /**
     * RETURN
     */

    return {

      success: true,

      ipos_response:
        responseData,

    };

  } catch (error) {

    /**
     * UPDATE LOG
     */

    await updateIposLog({

      log_id:
        log?.id,

      updates: {

        sync_status:
          "failed",

        retry_count: 1,

        error_message:
          error.message,

        response_payload: {

          error:
            error.message,

        },

      },

    });

    /**
     * UPDATE ORDER
     */

    try {

      await supabase

        .from("orders")

        .update({

          pos_sync_status:
            "failed",

          pos_error:
            error.message,

          updated_at:
            new Date(),

        })

        .eq(
          "id",
          order.id
        );

    } catch (orderError) {

      console.error(

        "order update error:",

        orderError.message

      );

    }

    /**
     * REALTIME
     */

    emitRealtime({

      event:
        "ipos_order_failed",

      payload: {

        order_id:
          order.id,

        transaction_code,

        sync_status:
          "failed",

        error:
          error.message,

      },

    });

    /**
     * RETURN
     */

    return {

      success: false,

      error:
        error.message,

    };

  }

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  pushOrderToIPOS,

};