const repository =
  require(
    "../repositories/cingArtilleryShotExecutionRepository"
  );

const {
  assertShotExecutionId,
  assertClaimToken,
  normalizeShotExecutionRecord,
} = require(
  "../domain/cingArtilleryShotExecutionContracts"
);

const POSTGRES_INTEGER_MAX =
  2147483647;

function buildError({
  message,
  code,
  statusCode = 500,
  cause,
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  if (cause) {
    error.cause =
      cause;
  }

  return error;
}

function assertPositiveInteger(
  value,
  field,
  code
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > POSTGRES_INTEGER_MAX
  ) {
    throw buildError({
      message:
        `Shot execution Cing Artillery không hợp lệ: ${field}`,
      code,
      statusCode:
        400,
    });
  }

  return value;
}

function normalizeLastError(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized =
    String(value);

  return normalized || null;
}

function mapRepositoryError(
  error
) {
  const message =
    String(
      error?.message || ""
    );

  const mappings = [
    {
      token:
        "CING_ARTILLERY_SHOT_EXECUTION_CLAIM_LIMIT_INVALID",
      message:
        "Claim limit shot execution Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_CLAIM_LIMIT_INVALID",
      statusCode:
        400,
    },
    {
      token:
        "CING_ARTILLERY_SHOT_EXECUTION_LEASE_INVALID",
      message:
        "Lease shot execution Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_LEASE_INVALID",
      statusCode:
        400,
    },
    {
      token:
        "CING_ARTILLERY_SHOT_EXECUTION_ID_REQUIRED",
      message:
        "Thiếu execution ID Cing Artillery",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_ID_REQUIRED",
      statusCode:
        400,
    },
    {
      token:
        "CING_ARTILLERY_SHOT_EXECUTION_CLAIM_TOKEN_REQUIRED",
      message:
        "Thiếu claim token shot execution Cing Artillery",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_CLAIM_TOKEN_REQUIRED",
      statusCode:
        400,
    },
    {
      token:
        "CING_ARTILLERY_SHOT_EXECUTION_NOT_FOUND",
      message:
        "Không tìm thấy shot execution Cing Artillery",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_NOT_FOUND",
      statusCode:
        404,
    },
    {
      token:
        "CING_ARTILLERY_SHOT_EXECUTION_CLAIM_CONFLICT",
      message:
        "Shot execution Cing Artillery đã thuộc claim khác",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_CLAIM_CONFLICT",
      statusCode:
        409,
    },
    {
      token:
        "CING_ARTILLERY_SHOT_EXECUTION_NOT_PROCESSING",
      message:
        "Shot execution Cing Artillery không ở trạng thái processing",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_NOT_PROCESSING",
      statusCode:
        409,
    },
    {
      token:
        "CING_ARTILLERY_SHOT_EXECUTION_LEASE_EXPIRED",
      message:
        "Lease shot execution Cing Artillery đã hết hạn",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_LEASE_EXPIRED",
      statusCode:
        409,
    },
    {
      token:
        "CING_ARTILLERY_SHOT_EXECUTION_RELEASE_LIMIT_INVALID",
      message:
        "Release limit shot execution Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_SHOT_EXECUTION_RELEASE_LIMIT_INVALID",
      statusCode:
        400,
    },
  ];

  const mapping =
    mappings.find(
      (candidate) =>
        message.includes(
          candidate.token
        )
    );

  if (!mapping) {
    return error;
  }

  return buildError({
    message:
      mapping.message,
    code:
      mapping.code,
    statusCode:
      mapping.statusCode,
    cause:
      error,
  });
}

async function claimShotExecutions({
  limit,
  leaseMs,
}) {
  const normalizedLimit =
    assertPositiveInteger(
      limit,
      "limit",
      "CING_ARTILLERY_SHOT_EXECUTION_CLAIM_LIMIT_INVALID"
    );

  const normalizedLeaseMs =
    assertPositiveInteger(
      leaseMs,
      "lease_ms",
      "CING_ARTILLERY_SHOT_EXECUTION_LEASE_INVALID"
    );

  try {
    const rows =
      await repository
        .claimAtomic({
          limit:
            normalizedLimit,
          leaseMs:
            normalizedLeaseMs,
        });

    return rows.map(
      normalizeShotExecutionRecord
    );
  } catch (error) {
    throw mapRepositoryError(
      error
    );
  }
}

async function completeShotExecution({
  executionId:
    rawExecutionId,
  claimToken:
    rawClaimToken,
}) {
  const executionId =
    assertShotExecutionId(
      rawExecutionId
    );

  const claimToken =
    assertClaimToken(
      rawClaimToken
    );

  try {
    const row =
      await repository
        .completeAtomic({
          executionId,
          claimToken,
        });

    if (!row) {
      throw buildError({
        message:
          "Không thể hoàn tất shot execution Cing Artillery",
        code:
          "CING_ARTILLERY_SHOT_EXECUTION_RESOLUTION_FAILED",
      });
    }

    return normalizeShotExecutionRecord(
      row
    );
  } catch (error) {
    throw mapRepositoryError(
      error
    );
  }
}

async function releaseShotExecution({
  executionId:
    rawExecutionId,
  claimToken:
    rawClaimToken,
  lastError = null,
}) {
  const executionId =
    assertShotExecutionId(
      rawExecutionId
    );

  const claimToken =
    assertClaimToken(
      rawClaimToken
    );

  const normalizedLastError =
    normalizeLastError(
      lastError
    );

  try {
    const row =
      await repository
        .releaseAtomic({
          executionId,
          claimToken,
          lastError:
            normalizedLastError,
        });

    if (!row) {
      throw buildError({
        message:
          "Không thể release shot execution Cing Artillery",
        code:
          "CING_ARTILLERY_SHOT_EXECUTION_RESOLUTION_FAILED",
      });
    }

    return normalizeShotExecutionRecord(
      row
    );
  } catch (error) {
    throw mapRepositoryError(
      error
    );
  }
}

async function releaseExpiredShotExecutions({
  limit,
}) {
  const normalizedLimit =
    assertPositiveInteger(
      limit,
      "limit",
      "CING_ARTILLERY_SHOT_EXECUTION_RELEASE_LIMIT_INVALID"
    );

  try {
    const rows =
      await repository
        .releaseExpiredAtomic({
          limit:
            normalizedLimit,
        });

    return rows.map(
      normalizeShotExecutionRecord
    );
  } catch (error) {
    throw mapRepositoryError(
      error
    );
  }
}

module.exports = {
  claimShotExecutions,
  completeShotExecution,
  releaseShotExecution,
  releaseExpiredShotExecutions,
};
