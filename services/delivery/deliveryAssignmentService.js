const deliveryAssignments =
  new Map();

/**
 * =====================================================
 * ASSIGN DELIVERY
 * =====================================================
 */

function assignDelivery({

  order_id,

  shipper_id,

  zone,

}) {

  const assignment = {

    order_id,

    shipper_id,

    zone,

    status:
      "assigned",

    assigned_at:
      Date.now(),

  };

  deliveryAssignments.set(

    order_id,

    assignment

  );

  return assignment;

}

/**
 * =====================================================
 * GET ASSIGNMENT
 * =====================================================
 */

function getDeliveryAssignment(
  order_id
) {

  return (
    deliveryAssignments.get(
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

  assignDelivery,

  getDeliveryAssignment,

};