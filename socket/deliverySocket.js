const {

  joinRoom,

} = require(
  "../services/realtime/socketRoomService"
);

const {

  buildDeliveryRoom,

} = require(
  "../services/realtime/realtimeChannels"
);

const logger =
  require(
    "../services/loggerService"
  );

/**
 * =====================================================
 * DELIVERY SOCKET
 * =====================================================
 */

function registerDeliverySocket({

  socket,

}) {

  socket.on(

    "delivery:connect",

    async (payload = {}) => {

      try {

        const {

          driver_id,

        } = payload;

        if (!driver_id) {

          return;

        }

        const room =
          buildDeliveryRoom(
            driver_id
          );

        await joinRoom({

          socket,

          room,

        });

        logger.info(

          "Delivery realtime connected",

          {

            driver_id,

            socket_id:
              socket.id,

          }

        );

      } catch (error) {

        logger.error(

          "Delivery socket failed",

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

  registerDeliverySocket,

};