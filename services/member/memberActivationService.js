const EVENTS =
  require(
    "../../core/events/eventConstants"
  );

const eventBus =
  require(
    "../../core/events/eventBus"
  );

async function emitMemberActivated({

  player,

}) {

  eventBus.emitEvent(

    EVENTS.MEMBER_ACTIVATED,

    {

      player,

    }

  );

}

module.exports = {

  emitMemberActivated,

};