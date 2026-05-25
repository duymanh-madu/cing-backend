/**
 * =====================================================
 * REALTIME EVENT VALIDATOR
 * =====================================================
 */

const {
  REALTIME_EVENTS,
} = require(
  "./realtimeEventConstants"
);

/**
 * =====================================================
 * VALID EVENT LIST
 * =====================================================
 */

const validEvents =
  new Set(
    Object.values(
      REALTIME_EVENTS
    )
  );

/**
 * =====================================================
 * VALIDATE EVENT NAME
 * =====================================================
 */

function validateEventName(
  event
) {

  if (
    !event
  ) {

    throw new Error(
      "Realtime event is required"
    );

  }

  if (
    typeof event !==
    "string"
  ) {

    throw new Error(
      "Realtime event must be string"
    );

  }

  if (
    !validEvents.has(
      event
    )
  ) {

    throw new Error(
      `Invalid realtime event: ${event}`
    );

  }

  return true;

}

/**
 * =====================================================
 * VALIDATE PAYLOAD
 * =====================================================
 */

function validatePayload(
  payload
) {

  if (
    payload ===
    undefined
  ) {

    throw new Error(
      "Realtime payload is required"
    );

  }

  if (
    payload ===
    null
  ) {

    throw new Error(
      "Realtime payload cannot be null"
    );

  }

  if (
    typeof payload !==
    "object"
  ) {

    throw new Error(
      "Realtime payload must be object"
    );

  }

  return true;

}

/**
 * =====================================================
 * VALIDATE ROOM
 * =====================================================
 */

function validateRoom(
  room
) {

  if (
    room ===
    undefined
  ) {

    return true;

  }

  if (
    typeof room !==
    "string"
  ) {

    throw new Error(
      "Realtime room must be string"
    );

  }

  if (
    !room.trim()
  ) {

    throw new Error(
      "Realtime room cannot be empty"
    );

  }

  return true;

}

/**
 * =====================================================
 * VALIDATE SOCKET ID
 * =====================================================
 */

function validateSocketId(
  socketId
) {

  if (
    socketId ===
    undefined
  ) {

    return true;

  }

  if (
    typeof socketId !==
    "string"
  ) {

    throw new Error(
      "Socket ID must be string"
    );

  }

  return true;

}

/**
 * =====================================================
 * FULL EVENT VALIDATION
 * =====================================================
 */

function validateRealtimeEvent({

  event,

  payload,

  room,

  socketId,

}) {

  validateEventName(
    event
  );

  validatePayload(
    payload
  );

  validateRoom(
    room
  );

  validateSocketId(
    socketId
  );

  return true;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  validateRealtimeEvent,

  validateEventName,

  validatePayload,

  validateRoom,

  validateSocketId,

};