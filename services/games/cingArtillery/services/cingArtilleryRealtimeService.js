const accountService =
  require(
    "./cingArtilleryAccountService"
  );

const {
  requireCingArtilleryEnabled,
} = require(
  "./cingArtilleryFeatureGateService"
);

const matchRuntimeService =
  require(
    "./cingArtilleryMatchRuntimeService"
  );

const {
  assertRealtimeJoinRequest,
  buildMatchRoomName,
} = require(
  "../domain/cingArtilleryRealtimeContracts"
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

async function authorizeMatchJoin({
  userId,
  payload,
}) {
  await requireCingArtilleryEnabled();

  const request =
    assertRealtimeJoinRequest(
      payload
    );

  const account =
    await accountService
      .getAccountByUserId(
        userId
      );

  if (!account?.id) {
    throw buildError({
      message:
        "Không tìm thấy tài khoản Cing Artillery",

      code:
        "CING_ARTILLERY_ACCOUNT_NOT_FOUND",

      statusCode:
        404,
    });
  }

  /*
   * Realtime is deliberately read-only against the
   * durable match-runtime authority.
   *
   * Runtime creation remains owned by the private
   * match-runtime write boundary.
   */
  const runtime =
    await matchRuntimeService
      .getMatchRuntime(
        request.matchId
      );

  if (!runtime) {
    throw buildError({
      message:
        "Match runtime Cing Artillery chưa sẵn sàng",

      code:
        "CING_ARTILLERY_MATCH_RUNTIME_NOT_READY",

      statusCode:
        409,
    });
  }

  const isPlayerOne =
    runtime.player_one_account_id ===
    account.id;

  const isPlayerTwo =
    runtime.player_two_account_id ===
    account.id;

  if (
    !isPlayerOne &&
    !isPlayerTwo
  ) {
    throw buildError({
      message:
        "Tài khoản không thuộc match Cing Artillery",

      code:
        "CING_ARTILLERY_MATCH_ACCESS_DENIED",

      statusCode:
        403,
    });
  }

  return {
    matchId:
      runtime.match_id,

    runtimeId:
      runtime.id,

    accountId:
      account.id,

    gameplaySessionId:
      isPlayerOne
        ? runtime.player_one_session_id
        : runtime.player_two_session_id,

    player:
      isPlayerOne
        ? "player_one"
        : "player_two",

    room:
      buildMatchRoomName(
        runtime.match_id
      ),
  };
}

module.exports = {
  authorizeMatchJoin,
};
