const appEventBus =
  require(
    "./appEventBus"
  );

function registerEvent({

  event,

  handler,

}) {

  appEventBus.registerHandler(

    event,

    handler

  );

}

module.exports = {

  registerEvent,

};