const {

  registerUserSocket,

} = require(
  "./userSocket"
);

const {

  registerAdminSocket,

} = require(
  "./adminSocket"
);

const {

  registerDeliverySocket,

} = require(
  "./deliverySocket"
);

const {

  registerNotificationSocket,

} = require(
  "./notificationSocket"
);

const {

  registerSocketSession,

  removeSocketSession,

} = require(
  "../services/realtime/socketSessionRegistry"
);

const {

  removeAllSocketRooms,

} = require(
  "../services/realtime/socketRoomRegistry"
);

const {

  markSocketOnline,

  markSocketOffline,

  heartbeatSocket,

} = require(
  "../services/realtime/socketPresenceService"
);

const logger =
  require(
    "../services/loggerService"
  );

/**
 * =====================================================
 * REGISTER SOCKET HANDLERS
 * =====================================================
 */

function registerSocketHandlers({

  io,

  onlineUsers = new Map(),

}) {

  /**
   * ===================================================
   * SOCKET CONNECTION
   * ===================================================
   */

  io.on(

    "connection",

    (socket) => {

      /**
       * ================================================
       * REGISTER SOCKET SESSION
       * ================================================
       */

      registerSocketSession({

        socketId:
          socket.id,

        metadata: {

          ip:
            socket.handshake
              ?.address || null,

          user_agent:
            socket.handshake
              ?.headers?.[
                "user-agent"
              ] || null,

          connected_at:
            new Date()
              .toISOString(),

        },

      });

      /**
       * ================================================
       * SOCKET ONLINE
       * ================================================
       */

      markSocketOnline(
        socket.id
      );

      /**
       * ================================================
       * LOG CONNECTION
       * ================================================
       */

      logger.info(

        "Socket connected",

        {

          socket_id:
            socket.id,

          transport:
            socket.conn
              ?.transport
              ?.name || null,

          ip:
            socket.handshake
              ?.address || null,

        }

      );

      /**
       * ================================================
       * REGISTER MODULE SOCKETS
       * ================================================
       */

      registerUserSocket({

        io,

        socket,

        onlineUsers,

      });

      registerAdminSocket({

        io,

        socket,

      });

      registerDeliverySocket({

        io,

        socket,

      });

      registerNotificationSocket({

        io,

        socket,

      });

      /**
       * ================================================
       * HEARTBEAT
       * ================================================
       */

      socket.on(

        "heartbeat",

        () => {

          heartbeatSocket(
            socket.id
          );

        }

      );

      /**
       * ================================================
       * SOCKET ERROR
       * ================================================
       */

      socket.on(

        "error",

        (error) => {

          logger.error(

            "Socket runtime error",

            {

              socket_id:
                socket.id,

              error:
                error?.message ||
                String(error),

            }

          );

        }

      );

      /**
       * ================================================
       * SOCKET DISCONNECT
       * ================================================
       */

      socket.on(

        "disconnect",

        (reason) => {

          try {

            /**
             * ============================================
             * SOCKET OFFLINE
             * ============================================
             */

            markSocketOffline(
              socket.id
            );

            /**
             * ============================================
             * REMOVE SESSION
             * ============================================
             */

            removeSocketSession(
              socket.id
            );

            /**
             * ============================================
             * REMOVE ROOMS
             * ============================================
             */

            removeAllSocketRooms(
              socket.id
            );

            /**
             * ============================================
             * REMOVE ONLINE USERS
             * ============================================
             */

            for (

              const [

                userId,

                socketId,

              ]

              of onlineUsers

            ) {

              if (
                socketId ===
                socket.id
              ) {

                onlineUsers.delete(
                  userId
                );

                break;

              }

            }

            /**
             * ============================================
             * LOG DISCONNECT
             * ============================================
             */

            logger.info(

              "Socket disconnected",

              {

                socket_id:
                  socket.id,

                reason,

              }

            );

          } catch (error) {

            logger.error(

              "Socket disconnect cleanup failed",

              {

                socket_id:
                  socket.id,

                error:
                  error.message,

              }

            );

          }

        }

      );

    }

  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  registerSocketHandlers,

};