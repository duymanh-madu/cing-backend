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

const combatStateService =
  require(
    "./cingArtilleryCombatStateService"
  );

const turnStateService =
  require(
    "./cingArtilleryTurnStateService"
  );

const shotCommandService =
  require(
    "./cingArtilleryShotCommandService"
  );

const {
  assertRealtimeJoinRequest,
  assertRealtimeLeaveRequest,
  assertRealtimeShotCommandRequest,
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

async function resolveMatchCombatStartAuthority(
  authority
) {
  const runtimeId =
    String(
      authority?.runtimeId || ""
    ).trim();

  if (!runtimeId) {
    throw buildError({
      message:
        "Match runtime authority Cing Artillery không hợp lệ",

      code:
        "CING_ARTILLERY_MATCH_RUNTIME_AUTHORITY_INVALID",

      statusCode:
        500,
    });
  }

  /*
   * Realtime readiness is a trigger only.
   *
   * It cannot choose initiative, participants, turn number
   * or timer. Those values are resolved exclusively through
   * the durable PostgreSQL authorities below.
   *
   * All transitions are idempotent:
   *
   *   runtime -> combat state
   *   combat state -> turn state
   *   pending turn -> canonical active initiative
   *
   * Concurrent Socket.IO instances may therefore enter this
   * boundary safely for the same match.
   */
  const combatState =
    await combatStateService
      .getOrCreateForMatchRuntime(
        runtimeId
      );

  if (!combatState?.id) {
    throw buildError({
      message:
        "Combat state authority Cing Artillery không hợp lệ",

      code:
        "CING_ARTILLERY_COMBAT_STATE_AUTHORITY_INVALID",

      statusCode:
        500,
    });
  }

  const turnState =
    await turnStateService
      .activateFirstTurnForCombatState(
        combatState.id
      );

  if (
    !turnState ||
    turnState.match_runtime_id !==
      runtimeId ||
    turnState.match_id !==
      authority.matchId ||
    turnState.combat_state_id !==
      combatState.id ||
    turnState.status !==
      "active" ||
    turnState.turn_number <= 0
  ) {
    throw buildError({
      message:
        "Canonical turn authority Cing Artillery không nhất quán",

      code:
        "CING_ARTILLERY_REALTIME_TURN_STATE_INCONSISTENT",

      statusCode:
        500,
    });
  }

  return turnState;
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

async function acceptRealtimeShotCommand({
  userId,
  payload,
}) {
  await requireCingArtilleryEnabled();

  const request =
    assertRealtimeShotCommandRequest(
      payload
    );

  /*
   * Durable shooter authority is derived from authenticated
   * match membership. Client input is intent only.
   */
  const authority =
    await resolveMatchRoomAuthority({
      userId,
      matchId:
        request.matchId,
    });

  const combatState =
    await combatStateService
      .getByMatchRuntimeId(
        authority.runtimeId
      );

  if (
    !combatState?.id ||
    combatState.match_runtime_id !==
      authority.runtimeId ||
    combatState.match_id !==
      authority.matchId
  ) {
    throw buildError({
      message:
        "Combat state authority Cing Artillery chưa sẵn sàng cho shot command",

      code:
        "CING_ARTILLERY_SHOT_COMBAT_STATE_NOT_READY",

      statusCode:
        409,
    });
  }

  const shotCommand =
    await shotCommandService
      .acceptShotCommand({
        combatStateId:
          combatState.id,

        shooterAccountId:
          authority.accountId,

        shooterSessionId:
          authority.gameplaySessionId,

        turnNumber:
          request.turnNumber,

        commandId:
          request.commandId,

        angleDeg:
          request.angleDeg,

        power:
          request.power,
      });

  return {
    authority,
    shotCommand,
  };
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
  acceptRealtimeShotCommand,
  authorizeMatchJoin,
  authorizeMatchLeave,
  resolveMatchCombatStartAuthority,
  resolveMatchRealtimeReadiness,
  resolveMatchReadinessAuthorityByMatchId,
};
