const logger =
  require(
    "../../services/loggerService"
  );

/**
 * =====================================================
 * REALTIME CONNECTION
 * =====================================================
 */

const {
  registerCingArtilleryRealtimeConnection,
} = require(
  "./cingArtilleryRealtimeConnectionHandler"
);

function realtimeConnectionHandler({

  io,

  socket,

}) {
  registerCingArtilleryRealtimeConnection({
    socket,
  });


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