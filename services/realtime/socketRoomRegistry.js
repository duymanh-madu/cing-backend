const logger =
  require(
    "../loggerService"
  );

/**
 * =====================================================
 * ROOM REGISTRY
 * =====================================================
 */

const socketRooms =
  new Map();

/**
 * =====================================================
 * REGISTER ROOM
 * =====================================================
 */

function registerSocketRoom({

  socketId,

  room,

}) {

  if (
    !socketRooms.has(
      socketId
    )
  ) {

    socketRooms.set(

      socketId,

      new Set()

    );

  }

  socketRooms
    .get(socketId)
    .add(room);

  logger.info(

    "Socket joined room",

    {

      socket_id:
        socketId,

      room,

    }

  );

}

/**
 * =====================================================
 * REMOVE ROOM
 * =====================================================
 */

function removeSocketRoom({

  socketId,

  room,

}) {

  if (
    !socketRooms.has(
      socketId
    )
  ) {

    return;

  }

  socketRooms
    .get(socketId)
    .delete(room);

  logger.info(

    "Socket left room",

    {

      socket_id:
        socketId,

      room,

    }

  );

}

/**
 * =====================================================
 * REMOVE ALL ROOMS
 * =====================================================
 */

function removeAllSocketRooms(
  socketId
) {

  socketRooms.delete(
    socketId
  );

}

/**
 * =====================================================
 * GET SOCKET ROOMS
 * =====================================================
 */

function getSocketRooms(
  socketId
) {

  return Array.from(

    socketRooms.get(
      socketId
    ) || []

  );

}

/**
 * =====================================================
 * GET REGISTRY
 * =====================================================
 */

function getSocketRoomRegistry() {

  return socketRooms;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  registerSocketRoom,

  removeSocketRoom,

  removeAllSocketRooms,

  getSocketRooms,

  getSocketRoomRegistry,

};