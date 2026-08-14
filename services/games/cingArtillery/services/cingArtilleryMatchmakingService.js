const gameEntryService =
  require(
    "./cingArtilleryGameEntryService"
  );

const gameplaySessionRepository =
  require(
    "../repositories/cingArtilleryGameplaySessionRepository"
  );

const matchmakingRepository =
  require(
    "../repositories/cingArtilleryMatchmakingRepository"
  );

const {
  normalizeGameplaySessionRecord,
} = require(
  "../domain/cingArtilleryGameplaySessionContracts"
);

const {
  normalizeMatchmakingDecision,
  assertEnterMatchmakingRequest,
} = require(
  "../domain/cingArtilleryMatchmakingContracts"
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

function mapMatchmakingError(
  error
) {
  const message =
    String(
      error?.message || ""
    );

  if (
    message.includes(
      "CING_ARTILLERY_GAMEPLAY_SESSION_NOT_FOUND"
    )
  ) {
    return buildError({
      message:
        "Không tìm thấy gameplay session Cing Artillery thuộc tài khoản này",

      code:
        "CING_ARTILLERY_GAMEPLAY_SESSION_NOT_FOUND",

      statusCode:
        404,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_GAMEPLAY_SESSION_NOT_ACTIVE"
    )
  ) {
    return buildError({
      message:
        "Gameplay session Cing Artillery không còn hoạt động",

      code:
        "CING_ARTILLERY_GAMEPLAY_SESSION_NOT_ACTIVE",

      statusCode:
        409,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_MATCHMAKING_LIVE_TICKET_CONFLICT"
    )
  ) {
    return buildError({
      message:
        "Tài khoản Cing Artillery đã có matchmaking ticket thuộc gameplay session khác",

      code:
        "CING_ARTILLERY_MATCHMAKING_LIVE_TICKET_CONFLICT",

      statusCode:
        409,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_MATCHMAKING_STATE_CONFLICT"
    )
  ) {
    return buildError({
      message:
        "Trạng thái matchmaking Cing Artillery xung đột",

      code:
        "CING_ARTILLERY_MATCHMAKING_STATE_CONFLICT",

      statusCode:
        409,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_MATCHMAKING_STATE_INCONSISTENT"
    )
  ) {
    return buildError({
      message:
        "Trạng thái matchmaking Cing Artillery không nhất quán",

      code:
        "CING_ARTILLERY_MATCHMAKING_STATE_INCONSISTENT",

      statusCode:
        500,
    });
  }

  return error;
}

async function enterMatchmaking({
  userId,
  gameplaySessionId,
}) {
  /*
   * Private matchmaking write boundary.
   *
   * Application authority:
   *   authenticated user -> game-entry readiness
   *   game-entry profile -> Cing Artillery account
   *
   * PostgreSQL authority:
   *   gameplay-session ownership
   *   active-session requirement
   *   one live ticket per account/session
   *   opponent serialization
   *   durable match creation
   *   atomic ticket transition
   *
   * This service intentionally does not:
   *   create gameplay sessions
   *   mutate gameplay-session lifecycle
   *   join realtime rooms
   *   initialize combat state
   *   update scores/ranking
   *   mutate economy/rewards
   *   expose a public route
   */
  const request =
    assertEnterMatchmakingRequest({
      userId,
      gameplaySessionId,
    });

  const entryDecision =
    await gameEntryService
      .getGameEntryDecision(
        request.userId
      );

  if (
    !entryDecision ||
    entryDecision.ready !== true ||
    entryDecision.state !== "ready" ||
    !entryDecision.profile?.account?.id
  ) {
    if (
      entryDecision?.onboarding_required ===
      true
    ) {
      throw buildError({
        message:
          "Cần hoàn tất onboarding Cing Artillery trước khi matchmaking",

        code:
          "CING_ARTILLERY_MATCHMAKING_ONBOARDING_REQUIRED",

        statusCode:
          409,
      });
    }

    if (
      entryDecision?.account_inactive ===
      true
    ) {
      throw buildError({
        message:
          "Tài khoản Cing Artillery hiện không hoạt động",

        code:
          "CING_ARTILLERY_ACCOUNT_NOT_ACTIVE",

        statusCode:
          403,
      });
    }

    throw buildError({
      message:
        "Game entry Cing Artillery không ở trạng thái sẵn sàng",

      code:
        "CING_ARTILLERY_GAME_ENTRY_NOT_READY",

      statusCode:
        409,
    });
  }

  const accountId =
    entryDecision.profile.account.id;

  const session =
    normalizeGameplaySessionRecord(
      await gameplaySessionRepository
        .findActiveByAccountId(
          accountId
        )
    );

  if (
    !session ||
    session.id !==
      request.gameplaySessionId
  ) {
    throw buildError({
      message:
        "Không tìm thấy gameplay session Cing Artillery đang hoạt động thuộc tài khoản này",

      code:
        "CING_ARTILLERY_GAMEPLAY_SESSION_NOT_FOUND",

      statusCode:
        404,
    });
  }

  try {
    return normalizeMatchmakingDecision(
      await matchmakingRepository
        .enterAtomic({
          accountId:
            accountId,

          gameplaySessionId:
            request.gameplaySessionId,
        })
    );
  } catch (error) {
    throw mapMatchmakingError(
      error
    );
  }
}

module.exports = {
  enterMatchmaking,
};
