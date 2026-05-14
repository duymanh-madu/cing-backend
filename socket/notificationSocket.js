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
 * NOTIFICATION SOCKET
 * =====================================================
 */

function registerNotificationSocket({

  socket,

}) {

  socket.on(

    "notification:subscribe",

    async () => {

      try {

        await joinRoom({

          socket,

          room:
            REALTIME_CHANNELS.NOTIFICATION,

        });

        logger.info(

          "Notification realtime subscribed",

          {

            socket_id:
              socket.id,

          }

        );

      } catch (error) {

        logger.error(

          "Notification socket failed",

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

  registerNotificationSocket,

};