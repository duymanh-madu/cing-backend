const ORDER_TRANSITIONS = {

  created: [

    "preparing",

    "cancelled",

  ],

  preparing: [

    "delivering",

    "failed",

  ],

  delivering: [

    "completed",

    "failed",

  ],

  completed: [],

  cancelled: [],

  failed: [],

};

/**
 * =====================================================
 * VALIDATE TRANSITION
 * =====================================================
 */

function canTransition({

  current_status,

  next_status,

}) {

  const allowed =
    ORDER_TRANSITIONS[
      current_status
    ] || [];

  return allowed.includes(
    next_status
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  ORDER_TRANSITIONS,

  canTransition,

};