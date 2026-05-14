/**
 * =====================================================
 * SOCKET SESSION REGISTRY
 * =====================================================
 */

const sessions = new Map();

/**
 * =====================================================
 * CREATE SESSION
 * =====================================================
 */

function registerSocketSession({

  socketId,

  userId = null,

  deviceId = null,

  metadata = {},

}) {

  const session = {

    socket_id: socketId,

    user_id: userId,

    device_id: deviceId,

    connected_at:
      new Date().toISOString(),

    last_seen:
      new Date().toISOString(),

    rooms: [],

    metadata,

    status: "online",

  };

  sessions.set(
    socketId,
    session
  );

  return session;

}

/**
 * =====================================================
 * REMOVE SESSION
 * =====================================================
 */

function removeSocketSession(
  socketId
) {

  return sessions.delete(
    socketId
  );

}

/**
 * =====================================================
 * UPDATE LAST SEEN
 * =====================================================
 */

function touchSocketSession(
  socketId
) {

  const session =
    sessions.get(socketId);

  if (!session) {

    return null;

  }

  session.last_seen =
    new Date().toISOString();

  sessions.set(
    socketId,
    session
  );

  return session;

}

/**
 * =====================================================
 * UPDATE STATUS
 * =====================================================
 */

function updateSocketStatus({

  socketId,

  status,

}) {

  const session =
    sessions.get(socketId);

  if (!session) {

    return null;

  }

  session.status = status;

  session.last_seen =
    new Date().toISOString();

  sessions.set(
    socketId,
    session
  );

  return session;

}

/**
 * =====================================================
 * JOIN ROOM
 * =====================================================
 */

function addSocketRoom({

  socketId,

  room,

}) {

  const session =
    sessions.get(socketId);

  if (!session) {

    return null;

  }

  if (
    !session.rooms.includes(room)
  ) {

    session.rooms.push(room);

  }

  session.last_seen =
    new Date().toISOString();

  sessions.set(
    socketId,
    session
  );

  return session;

}

/**
 * =====================================================
 * LEAVE ROOM
 * =====================================================
 */

function removeSocketRoom({

  socketId,

  room,

}) {

  const session =
    sessions.get(socketId);

  if (!session) {

    return null;

  }

  session.rooms =
    session.rooms.filter(
      (item) => item !== room
    );

  session.last_seen =
    new Date().toISOString();

  sessions.set(
    socketId,
    session
  );

  return session;

}

/**
 * =====================================================
 * GET SESSION
 * =====================================================
 */

function getSocketSession(
  socketId
) {

  return (
    sessions.get(socketId) ||
    null
  );

}

/**
 * =====================================================
 * GET USER SESSIONS
 * =====================================================
 */

function getUserSessions(
  userId
) {

  return Array.from(
    sessions.values()
  ).filter(
    (session) =>
      session.user_id === userId
  );

}

/**
 * =====================================================
 * GET ALL SESSIONS
 * =====================================================
 */

function getAllSocketSessions() {

  return Array.from(
    sessions.values()
  );

}

/**
 * =====================================================
 * GET ACTIVE CONNECTION COUNT
 * =====================================================
 */

function getActiveConnectionCount() {

  return sessions.size;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  registerSocketSession,

  removeSocketSession,

  touchSocketSession,

  updateSocketStatus,

  addSocketRoom,

  removeSocketRoom,

  getSocketSession,

  getUserSessions,

  getAllSocketSessions,

  getActiveConnectionCount,

};