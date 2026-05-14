const EventEmitter =
  require("events");

class AppEventBus extends EventEmitter {

  emitEvent(
    event,
    payload = {}
  ) {

    this.emit(
      event,
      payload
    );

  }

  register(
    event,
    handler
  ) {

    this.on(
      event,
      async (payload) => {

        try {

          await handler(
            payload
          );

        } catch (error) {

          console.error(

            `[EVENT ERROR] ${event}:`,

            error.message

          );

        }

      }
    );

  }

}

module.exports =
  new AppEventBus();