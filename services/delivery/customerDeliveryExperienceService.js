const customerDeliveryStates =
  new Map();

/**
 * =====================================================
 * UPDATE CUSTOMER DELIVERY EXPERIENCE
 * =====================================================
 */

function updateCustomerDeliveryExperience({

  user_id,

  order_id,

  message,

  eta_minutes,

}) {

  customerDeliveryStates.set(

    order_id,

    {

      user_id,

      order_id,

      message,

      eta_minutes,

      updated_at:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * GET CUSTOMER DELIVERY EXPERIENCE
 * =====================================================
 */

function getCustomerDeliveryExperience(
  order_id
) {

  return (
    customerDeliveryStates.get(
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

  updateCustomerDeliveryExperience,

  getCustomerDeliveryExperience,

};