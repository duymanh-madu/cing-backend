const eventBus =
  require(
    "../eventBus"
  );

eventBus.register(

  "realtime.emit",

  async ({
    io,
    room,
    event,
    payload,
  }) => {

    if (
      !io ||
      !room
    ) {

      return;

    }

    io.to(room).emit(
      event,
      payload
    );

  }

);