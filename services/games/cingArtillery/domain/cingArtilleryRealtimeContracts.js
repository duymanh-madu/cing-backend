const {
  assertMatchId,
} = require(
  "./cingArtilleryMatchRuntimeContracts"
);

function buildError({
  message,
  code,
  statusCode,
}) {
  const error =
    new Error(
      message
    );

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}

function assertAccessToken(
  value
) {
  const token =
    String(
      value || ""
    ).trim();

  if (!token) {
    throw buildError({
      message:
        "Thiếu access token Cing Artillery realtime",

      code:
        "CING_ARTILLERY_REALTIME_UNAUTHORIZED",

      statusCode:
        401,
    });
  }

  return token;
}

function assertRealtimeJoinRequest(
  payload
) {
  const source =
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload)
      ? payload
      : {};

  return {
    matchId:
      assertMatchId(
        source.matchId
      ),
  };
}

function assertRealtimeShotCommandRequest(
  payload
) {
  const source =
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload)
      ? payload
      : {};

  const {
    assertShotCommandId,
    assertShotTurnNumber,
    assertShotAngleDeg,
    assertShotPower,
  } = require(
    "./cingArtilleryShotCommandContracts"
  );

  return {
    matchId:
      assertMatchId(
        source.matchId
      ),

    commandId:
      assertShotCommandId(
        source.commandId
      ),

    turnNumber:
      assertShotTurnNumber(
        source.turnNumber
      ),

    angleDeg:
      assertShotAngleDeg(
        source.angleDeg
      ),

    power:
      assertShotPower(
        source.power
      ),
  };
}

function assertRealtimeLeaveRequest(
  payload
) {
  const source =
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload)
      ? payload
      : {};

  return {
    matchId:
      assertMatchId(
        source.matchId
      ),
  };
}

function parseMatchRoomName(
  rawRoom
) {
  const room =
    String(
      rawRoom || ""
    ).trim();

  const prefix =
    "cing-artillery:match:";

  if (
    !room.startsWith(
      prefix
    )
  ) {
    return null;
  }

  const matchId =
    room.slice(
      prefix.length
    );

  try {
    return assertMatchId(
      matchId
    );
  } catch (_error) {
    return null;
  }
}

function buildMatchRoomName(
  rawMatchId
) {
  const matchId =
    assertMatchId(
      rawMatchId
    );

  return `cing-artillery:match:${matchId}`;
}

module.exports = {
  assertAccessToken,
  assertRealtimeJoinRequest,
  assertRealtimeLeaveRequest,
  assertRealtimeShotCommandRequest,
  buildMatchRoomName,
  parseMatchRoomName,
};
