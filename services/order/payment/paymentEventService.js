const EVENTS =
  require(
    "../../core/events/eventConstants"
  );

const eventBus =
  require(
    "../../core/events/eventBus"
  );

async function emitPaymentSuccess({

  transaction,

  order,

}) {

  eventBus.emitEvent(

    EVENTS.PAYMENT_SUCCESS,

    {

      transaction,

      order,

    }

  );

}

module.exports = {

  emitPaymentSuccess,

};