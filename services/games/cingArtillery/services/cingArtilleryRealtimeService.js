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
  assertRealtimeLeaveRequest,
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

async function resolveMatchRoomAuthority({
  userId,
  matchId,
}) {
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
   * Realtime lifecycle remains read-only against the
   * durable match-runtime authority.
   *
   * Join, rejoin and explicit leave all resolve current
   * membership from durable runtime state. Socket-local
   * identity is never an authorization source.
   */
  const runtime =
    await matchRuntimeService
      .getMatchRuntime(
        matchId
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

    playerOneAccountId:
      runtime.player_one_account_id,

    playerTwoAccountId:
      runtime.player_two_account_id,

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

async function resolveMatchReadinessAuthorityByMatchId(
  matchId
) {
  const runtime =
    await matchRuntimeService
      .getMatchRuntime(
        matchId
      );

  if (!runtime) {
    return null;
  }

  return {
    matchId:
      runtime.match_id,

    playerOneAccountId:
      runtime.player_one_account_id,

    playerTwoAccountId:
      runtime.player_two_account_id,

    room:
      buildMatchRoomName(
        runtime.match_id
      ),
  };
}

async function resolveMatchRealtimeReadiness({
  io,
  authority,
}) {
  if (
    !io ||
    typeof io.in !== "function"
  ) {
    throw buildError({
      message:
        "Socket.IO authority Cing Artillery không hợp lệ",

      code:
        "CING_ARTILLERY_REALTIME_SERVER_INVALID",

      statusCode:
        500,
    });
  }

  const playerOneAccountId =
    String(
      authority?.playerOneAccountId || ""
    ).trim();

  const playerTwoAccountId =
    String(
      authority?.playerTwoAccountId || ""
    ).trim();

  if (
    !playerOneAccountId ||
    !playerTwoAccountId ||
    playerOneAccountId ===
      playerTwoAccountId
  ) {
    throw buildError({
      message:
        "Realtime participant authority Cing Artillery không hợp lệ",

      code:
        "CING_ARTILLERY_REALTIME_PARTICIPANTS_INVALID",

      statusCode:
        500,
    });
  }

  /*
   * fetchSockets() is adapter-aware and therefore sees
   * room members across Socket.IO instances through the
   * existing Redis adapter.
   *
   * Readiness is based on canonical Cing Artillery
   * account identity, never raw socket count.
   *
   * socket.data is transport metadata only. The account
   * id stored there was produced by authenticated +
   * durable match authorization before room join.
   */
  const sockets =
    await io
      .in(
        authority.room
      )
      .fetchSockets();

  const participantAccountIds =
    new Set();

  for (const candidate of sockets) {
    const accountId =
      String(
        candidate?.data
          ?.cingArtilleryAccountId ||
        ""
      ).trim();

    if (accountId) {
      participantAccountIds.add(
        accountId
      );
    }
  }

  const playerOneReady =
    participantAccountIds.has(
      playerOneAccountId
    );

  const playerTwoReady =
    participantAccountIds.has(
      playerTwoAccountId
    );

  return {
    matchId:
      authority.matchId,

    playerOneReady,

    playerTwoReady,

    bothReady:
      playerOneReady &&
      playerTwoReady,
  };
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

  return resolveMatchRoomAuthority({
    userId,
    matchId:
      request.matchId,
  });
}

async function authorizeMatchLeave({
  userId,
  payload,
}) {
  await requireCingArtilleryEnabled();

  const request =
    assertRealtimeLeaveRequest(
      payload
    );

  return resolveMatchRoomAuthority({
    userId,
    matchId:
      request.matchId,
  });
}

module.exports = {
  authorizeMatchJoin,
  authorizeMatchLeave,
  resolveMatchRealtimeReadiness,
  resolveMatchReadinessAuthorityByMatchId,
};
