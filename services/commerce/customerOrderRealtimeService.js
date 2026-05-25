const realtimeOrderStates =
  new Map();

/**
 * =====================================================
 * UPDATE CUSTOMER ORDER STATE
 * =====================================================
 */

function updateCustomerRealtimeOrder({

  user_id,

  order_id,

  status,

  message,

}) {

  realtimeOrderStates.set(

    order_id,

    {

      user_id,

      order_id,

      status,

      message,

      updated_at:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * GET CUSTOMER ORDER STATE
 * =====================================================
 */

function getCustomerRealtimeOrder(
  order_id
) {

  return (
    realtimeOrderStates.get(
      order_id
    ) || null
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  updateCustomerRealtimeOrder,

  getCustomerRealtimeOrder,

};