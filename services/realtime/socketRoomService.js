const {

  registerSocketRoom,

  removeSocketRoom,

} = require(
  "./socketRoomRegistry"
);

const logger =
  require(
    "../loggerService"
  );

/**
 * =====================================================
 * JOIN ROOM
 * =====================================================
 */

async function joinRoom({

  socket,

  room,

}) {

  await socket.join(
    room
  );

  registerSocketRoom({

    socketId:
      socket.id,

    room,

  });

  logger.info(

    "Socket room joined",

    {

      socket_id:
        socket.id,

      room,

    }

  );

}

/**
 * =====================================================
 * LEAVE ROOM
 * =====================================================
 */

async function leaveRoom({

  socket,

  room,

}) {

  await socket.leave(
    room
  );

  removeSocketRoom({

    socketId:
      socket.id,

    room,

  });

  logger.info(

    "Socket room left",

    {

      socket_id:
        socket.id,

      room,

    }

  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  joinRoom,

  leaveRoom,

};