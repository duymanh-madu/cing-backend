const {
  assertUserId,
} = require(
  "./cingArtilleryContracts"
);

const CING_ARTILLERY_GAMEPLAY_SESSION_STATUS =
  Object.freeze({
    ACTIVE:
      "active",

    COMPLETED:
      "completed",

    ABANDONED:
      "abandoned",
  });

const VALID_GAMEPLAY_SESSION_STATUSES =
  new Set(
    Object.values(
      CING_ARTILLERY_GAMEPLAY_SESSION_STATUS
    )
  );

function assertGameplaySessionStatus(
  value
) {
  const status =
    String(
      value || ""
    ).trim();

  if (
    !VALID_GAMEPLAY_SESSION_STATUSES.has(
      status
    )
  ) {
    const error =
      new Error(
        `Trạng thái gameplay session Cing Artillery không hợp lệ: ${status}`
      );

    error.code =
      "CING_ARTILLERY_INVALID_GAMEPLAY_SESSION_STATUS";

    error.statusCode =
      500;

    throw error;
  }

  return status;
}

function normalizeGameplaySessionRecord(
  row
) {
  if (!row) {
    return null;
  }

  const id =
    String(
      row.id || ""
    ).trim();

  const accountId =
    String(
      row.account_id || ""
    ).trim();

  if (
    !id ||
    !accountId
  ) {
    const error =
      new Error(
        "Gameplay session Cing Artillery không hợp lệ"
      );

    error.code =
      "CING_ARTILLERY_INVALID_GAMEPLAY_SESSION";

    error.statusCode =
      500;

    throw error;
  }

  return {
    id,

    account_id:
      accountId,

    status:
      assertGameplaySessionStatus(
        row.status
      ),

    started_at:
      row.started_at || null,

    ended_at:
      row.ended_at || null,

    created_at:
      row.created_at || null,

    updated_at:
      row.updated_at || null,
  };
}

function assertCreateGameplaySessionRequest({
  userId,
}) {
  return {
    userId:
      assertUserId(
        userId
      ),
  };
}

module.exports = {
  CING_ARTILLERY_GAMEPLAY_SESSION_STATUS,
  assertGameplaySessionStatus,
  normalizeGameplaySessionRecord,
  assertCreateGameplaySessionRequest,
};
