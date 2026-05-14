const logger =
  require("./logger");

function logEvent(
  event
) {

  logger.info(

    "Event emitted",

    {

      event_name:

        event.event_name,

      event_id:

        event.event_id,

    }

  );

}

module.exports = {

  logEvent,

};