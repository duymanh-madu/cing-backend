const supabase =
  require("../supabase");

/**
 * ============================================
 * VERIFY PAYMENT
 * ============================================
 */

async function verifyPayment({

  order_id,

  transaction_id = null,

  payment_method = null,

  payment_payload = {},

}) {

  if (!order_id) {

    throw new Error(
      "order_id is required"
    );

  }

  /**
   * ============================================
   * FIND ORDER
   * ============================================
   */

  const {

    data: order,

    error: orderError,

  } = await supabase

    .from("orders")

    .select("*")

    .eq(
      "id",
      order_id
    )

    .maybeSingle();

  if (orderError) {

    throw new Error(
      orderError.message
    );

  }

  if (!order) {

    throw new Error(
      "Order not found"
    );

  }

  /**
   * ============================================
   * ALREADY PAID
   * ============================================
   */

  if (

    order.payment_status ===
    "paid"

  ) {

    return {

      success: true,

      already_paid: true,

      order,

    };

  }

  /**
   * ============================================
   * UPDATE ORDER
   * ============================================
   */

  const {

    data: updatedOrder,

    error: updateError,

  } = await supabase

    .from("orders")

    .update({

      payment_status:
        "paid",

      transaction_id:
        transaction_id,

      payment_method:
        payment_method ||

        order.payment_method,

      payment_verified_at:
        new Date(),

      payment_payload,

      updated_at:
        new Date(),

    })

    .eq(
      "id",
      order_id
    )

    .select("*")

    .maybeSingle();

  if (updateError) {

    throw new Error(
      updateError.message
    );

  }

  /**
   * ============================================
   * REALTIME
   * ============================================
   */

  try {

    const io =
      global.io;

    if (

      io &&

      updatedOrder.user_id

    ) {

      io.to(

        `user:${updatedOrder.user_id}`

      ).emit(

        "payment_verified",

        {

          order_id:
            updatedOrder.id,

          order_code:
            updatedOrder.order_code,

        }

      );

    }

  } catch (socketError) {

    console.error(

      "payment realtime error:",

      socketError.message

    );

  }

  return {

    success: true,

    order:
      updatedOrder,

  };

}

module.exports = {

  verifyPayment,

};