const PAYMENT_STATES = {

  CREATED:
    "created",

  PENDING:
    "pending",

  PAID:
    "paid",

  FAILED:
    "failed",

  EXPIRED:
    "expired",

  CANCELLED:
    "cancelled",

};

const allowedTransitions = {

  created: [
    "pending",
    "cancelled",
    "expired",
  ],

  pending: [
    "paid",
    "failed",
    "expired",
    "cancelled",
  ],

  paid: [],

  failed: [],

  expired: [],

  cancelled: [],

};

function canTransition({

  currentState,

  nextState,

}) {

  const allowed =
    allowedTransitions[
      currentState
    ] || [];

  return allowed.includes(
    nextState
  );

}

module.exports = {

  PAYMENT_STATES,

  canTransition,

};