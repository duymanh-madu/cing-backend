const crypto =
  require(
    "crypto"
  );

const gameEntryService =
  require(
    "./cingArtilleryGameEntryService"
  );

const accountRepository =
  require(
    "../repositories/cingArtilleryAccountRepository"
  );

const gameplaySessionRepository =
  require(
    "../repositories/cingArtilleryGameplaySessionRepository"
  );

const {
  CING_ARTILLERY_GAMEPLAY_SESSION_STATUS,
  normalizeGameplaySessionRecord,
  assertCreateGameplaySessionRequest,
  assertEndGameplaySessionRequest,
} = require(
  "../domain/cingArtilleryGameplaySessionContracts"
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

function requireReadyGameEntry(
  decision
) {
  if (
    !decision ||
    decision.ready !== true ||
    decision.state !== "ready" ||
    !decision.profile?.account?.id
  ) {
    if (
      decision?.onboarding_required ===
      true
    ) {
      throw buildError({
        message:
          "Cần hoàn tất onboarding Cing Artillery trước khi tạo gameplay session",

        code:
          "CING_ARTILLERY_GAMEPLAY_SESSION_ONBOARDING_REQUIRED",

        statusCode:
          409,
      });
    }

    if (
      decision?.account_inactive ===
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

  return decision;
}

async function getActiveGameplaySession(
  rawUserId
) {
  const request =
    assertCreateGameplaySessionRequest({
      userId:
        rawUserId,
    });

  const decision =
    requireReadyGameEntry(
      await gameEntryService
        .getGameEntryDecision(
          request.userId
        )
    );

  const session =
    await gameplaySessionRepository
      .findActiveByAccountId(
        decision.profile.account.id
      );

  return normalizeGameplaySessionRecord(
    session
  );
}

async function getOrCreateGameplaySession(
  rawUserId
) {
  /*
   * Private gameplay-session write boundary.
   *
   * Game-entry readiness must be established before
   * any durable gameplay session is created.
   *
   * This service intentionally does not:
   *   enqueue matchmaking
   *   assign opponents
   *   join realtime rooms
   *   initialize combat state
   *   update scores/ranking
   *   mutate economy/rewards
   */
  const request =
    assertCreateGameplaySessionRequest({
      userId:
        rawUserId,
    });

  const decision =
    requireReadyGameEntry(
      await gameEntryService
        .getGameEntryDecision(
          request.userId
        )
    );

  const accountId =
    decision.profile.account.id;

  const existing =
    await gameplaySessionRepository
      .findActiveByAccountId(
        accountId
      );

  if (existing) {
    return {
      created:
        false,

      session:
        normalizeGameplaySessionRecord(
          existing
        ),
    };
  }

  try {
    const created =
      await gameplaySessionRepository
        .createActive({
          id:
            crypto.randomUUID(),

          accountId,
        });

    return {
      created:
        true,

      session:
        normalizeGameplaySessionRecord(
          created
        ),
    };
  } catch (error) {
    /*
     * Concurrent session creation is resolved by
     * PostgreSQL partial unique index:
     *
     *   one active session per account.
     *
     * Re-read the canonical active row after 23505.
     */
    if (
      error?.code ===
      "23505"
    ) {
      const session =
        await gameplaySessionRepository
          .findActiveByAccountId(
            accountId
          );

      if (session) {
        return {
          created:
            false,

          session:
            normalizeGameplaySessionRecord(
              session
            ),
        };
      }
    }

    throw error;
  }
}

function mapEndGameplaySessionError(
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
      "CING_ARTILLERY_GAMEPLAY_SESSION_STATE_CONFLICT"
    )
  ) {
    return buildError({
      message:
        "Gameplay session Cing Artillery đã kết thúc ở trạng thái khác",

      code:
        "CING_ARTILLERY_GAMEPLAY_SESSION_STATE_CONFLICT",

      statusCode:
        409,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_INVALID_GAMEPLAY_SESSION_TERMINAL_STATUS"
    )
  ) {
    return buildError({
      message:
        "Trạng thái kết thúc gameplay session Cing Artillery không hợp lệ",

      code:
        "CING_ARTILLERY_INVALID_GAMEPLAY_SESSION_TERMINAL_STATUS",

      statusCode:
        400,
    });
  }

  return error;
}

async function endGameplaySession({
  userId,
  sessionId,
  status,
}) {
  /*
   * Private lifecycle write boundary.
   *
   * Ownership is resolved from the authenticated Cing
   * Artillery account and enforced again atomically by
   * PostgreSQL using account_id + session_id.
   *
   * This service intentionally does not:
   *   mutate combat state
   *   update scores/ranking
   *   mutate economy/rewards
   *   expose a public route
   */
  const request =
    assertEndGameplaySessionRequest({
      userId,
      sessionId,
      status,
    });

  const account =
    await accountRepository
      .findByUserId(
        request.userId
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

  try {
    const session =
      await gameplaySessionRepository
        .endAtomic({
          accountId:
            account.id,

          sessionId:
            request.sessionId,

          status:
            request.status,
        });

    return normalizeGameplaySessionRecord(
      session
    );
  } catch (error) {
    throw mapEndGameplaySessionError(
      error
    );
  }
}

function isGameplaySessionActive(
  rawSession
) {
  const session =
    normalizeGameplaySessionRecord(
      rawSession
    );

  return (
    session?.status ===
    CING_ARTILLERY_GAMEPLAY_SESSION_STATUS
      .ACTIVE
  );
}

module.exports = {
  getActiveGameplaySession,
  getOrCreateGameplaySession,
  endGameplaySession,
  isGameplaySessionActive,
};
