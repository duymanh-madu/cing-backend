const {
  CING_ARTILLERY_ACCOUNT_STATUS,
} = require(
  "./cingArtilleryConstants"
);

const VALID_ACCOUNT_STATUSES =
  new Set(
    Object.values(
      CING_ARTILLERY_ACCOUNT_STATUS
    )
  );

function normalizeUserId(
  value
) {
  return String(
    value || ""
  ).trim();
}

function assertUserId(
  value
) {
  const userId =
    normalizeUserId(
      value
    );

  if (!userId) {
    const error =
      new Error(
        "Thiếu user_id cho Cing Artillery"
      );

    error.code =
      "CING_ARTILLERY_USER_ID_REQUIRED";

    error.statusCode =
      400;

    throw error;
  }

  return userId;
}

function assertAccountStatus(
  value
) {
  const status =
    String(
      value || ""
    ).trim();

  if (
    !VALID_ACCOUNT_STATUSES.has(
      status
    )
  ) {
    const error =
      new Error(
        `Trạng thái Cing Artillery không hợp lệ: ${status}`
      );

    error.code =
      "CING_ARTILLERY_INVALID_ACCOUNT_STATUS";

    error.statusCode =
      400;

    throw error;
  }

  return status;
}

function normalizeAccountRecord(
  row
) {
  if (!row) {
    return null;
  }

  return {
    id:
      row.id,

    user_id:
      row.user_id,

    status:
      row.status,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,
  };
}

module.exports = {
  normalizeUserId,
  assertUserId,
  assertAccountStatus,
  normalizeAccountRecord,
};
