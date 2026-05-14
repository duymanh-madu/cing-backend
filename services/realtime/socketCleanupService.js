const {
  getStaleSockets,
  markSocketOffline,
} = require(
  "./socketPresenceService"
);

const logger =
  require(
    "../loggerService"
  );

/**
 * =====================================================
 * CLEANUP STALE SOCKETS
 * =====================================================
 */

function cleanupStaleSockets({

  staleThresholdMs =
    60000,

} = {}) {

  const staleSockets =
    getStaleSockets({

      staleThresholdMs,

    });

  for (const socket of staleSockets) {

    markSocketOffline(
      socket.socket_id
    );

    logger.warn(
      "Stale socket cleaned",
      {

        socket_id:
          socket.socket_id,

      }
    );

  }

  return {

    cleaned:
      staleSockets.length,

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  cleanupStaleSockets,

};