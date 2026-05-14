/**
 * =====================================================
 * SOCKET PRESENCE STORE
 * =====================================================
 */

const socketPresenceMap =
  new Map();

/**
 * =====================================================
 * ONLINE
 * =====================================================
 */

function markSocketOnline(
  socketId
) {

  socketPresenceMap.set(
    socketId,
    {

      socket_id:
        socketId,

      status:
        "online",

      connected_at:
        new Date()
          .toISOString(),

      last_heartbeat:
        Date.now(),

    }
  );

}

/**
 * =====================================================
 * HEARTBEAT
 * =====================================================
 */

function heartbeatSocket(
  socketId
) {

  const socket =
    socketPresenceMap.get(
      socketId
    );

  if (!socket) {

    return;

  }

  socket.last_heartbeat =
    Date.now();

  socketPresenceMap.set(
    socketId,
    socket
  );

}

/**
 * =====================================================
 * OFFLINE
 * =====================================================
 */

function markSocketOffline(
  socketId
) {

  socketPresenceMap.delete(
    socketId
  );

}

/**
 * =====================================================
 * GET SOCKETS
 * =====================================================
 */

function getSocketPresence() {

  return Array.from(
    socketPresenceMap.values()
  );

}

/**
 * =====================================================
 * GET STALE SOCKETS
 * =====================================================
 */

function getStaleSockets({

  staleThresholdMs =
    60000,

} = {}) {

  const now =
    Date.now();

  return getSocketPresence()
    .filter(
      (socket) => {

        const diff =
          now -
          socket.last_heartbeat;

        return (
          diff >
          staleThresholdMs
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

  markSocketOnline,

  markSocketOffline,

  heartbeatSocket,

  getSocketPresence,

  getStaleSockets,

};