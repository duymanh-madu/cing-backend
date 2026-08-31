"use strict";

const repository =
  require(
    "../repositories/cingArtilleryResultStreamRepository"
  );

const CANONICAL_CURSOR_RE =
  /^(0|[1-9][0-9]*)$/u;

const DEFAULT_LIMIT =
  32;

const MAX_LIMIT =
  100;

function buildError({
  message,
  code =
    "CING_ARTILLERY_RESULT_STREAM_REQUEST_INVALID_V1",
  statusCode =
    400,
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}

function requiredIdentity(
  value,
  field
) {
  const normalized =
    String(value || "")
      .trim()
      .toLowerCase();

  if (!normalized) {
    throw buildError({
      message:
        `Cing Artillery result stream thiếu ${field}`,
    });
  }

  return normalized;
}

function canonicalCursor(
  value
) {
  const normalized =
    String(
      value === undefined ||
      value === null
        ? ""
        : value
    );

  if (
    !CANONICAL_CURSOR_RE.test(
      normalized
    )
  ) {
    throw buildError({
      message:
        "Cing Artillery result cursor không hợp lệ",
      code:
        "CING_ARTILLERY_RESULT_STREAM_CURSOR_INVALID_V1",
    });
  }

  return normalized;
}

function boundedLimit(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return DEFAULT_LIMIT;
  }

  const normalized =
    Number(value);

  if (
    !Number.isSafeInteger(
      normalized
    ) ||
    normalized < 1 ||
    normalized > MAX_LIMIT
  ) {
    throw buildError({
      message:
        "Cing Artillery result stream limit không hợp lệ",
      code:
        "CING_ARTILLERY_RESULT_STREAM_LIMIT_INVALID_V1",
    });
  }

  return normalized;
}

function normalizeResultRow(
  row
) {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    throw buildError({
      message:
        "Cing Artillery result stream row không hợp lệ",
      code:
        "CING_ARTILLERY_RESULT_STREAM_ROW_INVALID_V1",
      statusCode:
        500,
    });
  }

  const sequence =
    canonicalCursor(
      row.result_sequence
    );

  if (sequence === "0") {
    throw buildError({
      message:
        "Cing Artillery durable result sequence phải > 0",
      code:
        "CING_ARTILLERY_RESULT_STREAM_SEQUENCE_INVALID_V1",
      statusCode:
        500,
    });
  }

  return Object.freeze({
    ...row,
    result_sequence:
      sequence,
  });
}

async function readAuthorizedResultStream({
  matchId,
  matchRuntimeId,
  accountId,
  afterSequence,
  limit,
}) {
  const normalizedMatchId =
    requiredIdentity(
      matchId,
      "match_id"
    );

  const normalizedRuntimeId =
    requiredIdentity(
      matchRuntimeId,
      "runtime_id"
    );

  const normalizedAccountId =
    requiredIdentity(
      accountId,
      "account_id"
    );

  const cursor =
    canonicalCursor(
      afterSequence
    );

  const bounded =
    boundedLimit(
      limit
    );

  const rows =
    await repository.readAuthorized({
      matchId:
        normalizedMatchId,
      matchRuntimeId:
        normalizedRuntimeId,
      accountId:
        normalizedAccountId,
      afterSequence:
        cursor,
      limit:
        bounded,
    });

  const results =
    rows.map(
      normalizeResultRow
    );

  let nextCursor =
    cursor;

  for (const result of results) {
    if (
      BigInt(
        result.result_sequence
      ) <=
      BigInt(nextCursor)
    ) {
      throw buildError({
        message:
          "Cing Artillery result stream ordering không hợp lệ",
        code:
          "CING_ARTILLERY_RESULT_STREAM_ORDER_INVALID_V1",
        statusCode:
          500,
      });
    }

    nextCursor =
      result.result_sequence;
  }

  return Object.freeze({
    match_id:
      normalizedMatchId,
    runtime_id:
      normalizedRuntimeId,
    after_sequence:
      cursor,
    next_sequence:
      nextCursor,
    results:
      Object.freeze(results),
    has_more:
      results.length === bounded,
  });
}

async function readAuthorizedResultStreamHead({
  matchId,
  matchRuntimeId,
  accountId,
}) {
  const normalizedMatchId =
    requiredIdentity(
      matchId,
      "match_id"
    );

  const normalizedRuntimeId =
    requiredIdentity(
      matchRuntimeId,
      "runtime_id"
    );

  const normalizedAccountId =
    requiredIdentity(
      accountId,
      "account_id"
    );

  const head =
    canonicalCursor(
      await repository.readHeadAuthorized({
        matchId:
          normalizedMatchId,
        matchRuntimeId:
          normalizedRuntimeId,
        accountId:
          normalizedAccountId,
      })
    );

  return Object.freeze({
    match_id:
      normalizedMatchId,
    runtime_id:
      normalizedRuntimeId,
    result_sequence:
      head,
  });
}

module.exports = {
  readAuthorizedResultStream,
  readAuthorizedResultStreamHead,
};
