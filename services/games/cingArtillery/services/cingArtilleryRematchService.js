"use strict";

const accountService =
  require(
    "./cingArtilleryAccountService"
  );

const matchRuntimeService =
  require(
    "./cingArtilleryMatchRuntimeService"
  );

const rematchRepository =
  require(
    "../repositories/cingArtilleryRematchRepository"
  );

const {
  REMATCH_STATUS,
  assertSourceMatchId,
  normalizeRematchHandshakeRecord,
} = require(
  "../domain/cingArtilleryRematchContracts"
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

function mapRematchError(
  error
) {
  const message =
    String(
      error?.message || ""
    );

  if (
    message.includes(
      "CING_ARTILLERY_REMATCH_SOURCE_MATCH_NOT_FOUND"
    )
  ) {
    return buildError({
      message:
        "Không tìm thấy trận Cing Piu Piu để đấu lại",

      code:
        "CING_ARTILLERY_REMATCH_SOURCE_MATCH_NOT_FOUND",

      statusCode:
        404,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_REMATCH_NOT_PARTICIPANT"
    )
  ) {
    return buildError({
      message:
        "Bạn không thuộc trận Cing Piu Piu này",

      code:
        "CING_ARTILLERY_REMATCH_NOT_PARTICIPANT",

      statusCode:
        403,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_REMATCH_SOURCE_MATCH_NOT_COMPLETED"
    ) ||
    message.includes(
      "CING_ARTILLERY_REMATCH_SOURCE_SESSION_NOT_TERMINAL"
    )
  ) {
    return buildError({
      message:
        "Trận Cing Piu Piu chưa đủ điều kiện đấu lại",

      code:
        "CING_ARTILLERY_REMATCH_SOURCE_NOT_TERMINAL",

      statusCode:
        409,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_REMATCH_ACTIVE_SESSION_CONFLICT"
    )
  ) {
    return buildError({
      message:
        "Một người chơi đang có phiên Cing Piu Piu khác",

      code:
        "CING_ARTILLERY_REMATCH_ACTIVE_SESSION_CONFLICT",

      statusCode:
        409,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_REMATCH_WAITING_TICKET_CONFLICT"
    )
  ) {
    return buildError({
      message:
        "Một người chơi đang chờ ghép trận Cing Piu Piu khác",

      code:
        "CING_ARTILLERY_REMATCH_WAITING_TICKET_CONFLICT",

      statusCode:
        409,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_REMATCH_PARTICIPANT_ACCESS_REVOKED"
    ) ||
    message.includes(
      "cing_artillery_disabled"
    )
  ) {
    return buildError({
      message:
        "Cing Piu Piu hiện không khả dụng cho một người chơi",

      code:
        "CING_ARTILLERY_REMATCH_ACCESS_DENIED",

      statusCode:
        403,
    });
  }

  if (
    message.includes(
      "CING_ARTILLERY_REMATCH_RESULT_INVALID"
    ) ||
    message.includes(
      "CING_ARTILLERY_REMATCH_HANDSHAKE_IDENTITY_CONFLICT"
    ) ||
    message.includes(
      "CING_ARTILLERY_REMATCH_SOURCE_SESSION_INCONSISTENT"
    ) ||
    message.includes(
      "CING_ARTILLERY_REMATCH_FINALIZATION_CONFLICT"
    )
  ) {
    return buildError({
      message:
        "Trạng thái đấu lại Cing Piu Piu không nhất quán",

      code:
        "CING_ARTILLERY_REMATCH_STATE_INCONSISTENT",

      statusCode:
        500,
    });
  }

  return error;
}

async function requestSameOpponentRematch({
  userId,
  sourceMatchId:
    rawSourceMatchId,
}) {
  const sourceMatchId =
    assertSourceMatchId(
      rawSourceMatchId
    );

  /*
   * Authenticated application identity is translated to
   * canonical artillery account identity server-side.
   *
   * The client never supplies:
   *   account id
   *   opponent id
   *   gameplay session id
   *   rematch match id
   */
  const account =
    await accountService
      .getAccountByUserId(
        userId
      );

  if (!account?.id) {
    throw buildError({
      message:
        "Không tìm thấy tài khoản Cing Piu Piu",

      code:
        "CING_ARTILLERY_ACCOUNT_NOT_FOUND",

      statusCode:
        404,
    });
  }

  try {
    const rawHandshake =
      await rematchRepository
        .requestSameOpponentRematchAtomic({
          sourceMatchId,

          accountId:
            account.id,
        });

    const handshake =
      normalizeRematchHandshakeRecord(
        rawHandshake
      );

    if (
      handshake.status !==
      REMATCH_STATUS.MATCHED
    ) {
      return handshake;
    }

    const runtime =
      await matchRuntimeService
        .getOrCreateMatchRuntime(
          handshake.rematch_match_id
        );

    return Object.freeze({
      ...handshake,

      runtime,
    });
  } catch (error) {
    throw mapRematchError(
      error
    );
  }
}

module.exports = {
  requestSameOpponentRematch,
};
