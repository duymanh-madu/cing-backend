const logger =
  require(
    "../../services/loggerService"
  );

/**
 * =====================================================
 * REALTIME CONNECTION
 * =====================================================
 */

function realtimeConnectionHandler({

  io,

  socket,

}) {

  logger.info(
    "socket connected",
    {
      socketId:
        socket.id,
    }
  );

  socket.emit(
    "runtime:connected",
    {

      socketId:
        socket.id,

      timestamp:
        Date.now(),

    }
  );

  socket.on(
    "disconnect",
    (
      reason
    ) => {

      logger.info(
        "socket disconnected",
        {
          socketId:
            socket.id,

          reason,
        }
      );

    }
  );

}

module.exports =
  realtimeConnectionHandler;