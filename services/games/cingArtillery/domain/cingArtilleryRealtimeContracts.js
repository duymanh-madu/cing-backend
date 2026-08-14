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
  buildMatchRoomName,
};
