const EVENTS =
  require(
    "../../core/events/eventConstants"
  );

const eventBus =
  require(
    "../../core/events/eventBus"
  );

async function onOrderCreated({

  order,

}) {

  eventBus.emitEvent(

    EVENTS.ORDER_CREATED,

    {

      order_id:
        order.id,

      order,

    }

  );

}

module.exports = {

  onOrderCreated,

};