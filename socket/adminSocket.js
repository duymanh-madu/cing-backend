const {

  joinRoom,

} = require(
  "../services/realtime/socketRoomService"
);

const {

  REALTIME_CHANNELS,

} = require(
  "../services/realtime/realtimeChannels"
);

const logger =
  require(
    "../services/loggerService"
  );

/**
 * =====================================================
 * ADMIN SOCKET
 * =====================================================
 */

function registerAdminSocket({

  socket,

}) {

  socket.on(

    "admin:connect",

    async () => {

      try {

        await joinRoom({

          socket,

          room:
            REALTIME_CHANNELS.ADMIN,

        });

        logger.info(

          "Admin realtime connected",

          {

            socket_id:
              socket.id,

          }

        );

      } catch (error) {

        logger.error(

          "Admin socket failed",

          {

            error:
              error.message,

          }

        );

      }

    }

  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  registerAdminSocket,

};