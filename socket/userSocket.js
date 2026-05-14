const {

  joinRoom,

  leaveRoom,

} = require(
  "../services/realtime/socketRoomService"
);

const {

  buildMemberRoom,

} = require(
  "../services/realtime/realtimeChannels"
);

const logger =
  require(
    "../services/loggerService"
  );

/**
 * =====================================================
 * USER SOCKET
 * =====================================================
 */

function registerUserSocket({

  socket,

  onlineUsers,

}) {

  /**
   * ============================================
   * MEMBER AUTH
   * ============================================
   */

  socket.on(

    "member:connect",

    async (payload = {}) => {

      try {

        const {

          member_id,

        } = payload;

        if (!member_id) {

          return;

        }

        /**
         * ========================================
         * ONLINE USERS
         * ========================================
         */

        onlineUsers.set(

          member_id,

          socket.id

        );

        /**
         * ========================================
         * MEMBER ROOM
         * ========================================
         */

        const room =
          buildMemberRoom(
            member_id
          );

        await joinRoom({

          socket,

          room,

        });

        logger.info(

          "Member connected to realtime",

          {

            member_id,

            socket_id:
              socket.id,

            room,

          }

        );

      } catch (error) {

        logger.error(

          "Member realtime connection failed",

          {

            error:
              error.message,

          }

        );

      }

    }

  );

  /**
   * ============================================
   * LEAVE MEMBER ROOM
   * ============================================
   */

  socket.on(

    "member:disconnect",

    async (payload = {}) => {

      try {

        const {

          member_id,

        } = payload;

        if (!member_id) {

          return;

        }

        const room =
          buildMemberRoom(
            member_id
          );

        await leaveRoom({

          socket,

          room,

        });

        onlineUsers.delete(
          member_id
        );

      } catch (error) {

        logger.error(

          "Member room leave failed",

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

  registerUserSocket,

};