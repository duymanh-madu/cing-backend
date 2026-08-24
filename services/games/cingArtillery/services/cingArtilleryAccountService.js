"use strict";

const accountRepository =
  require(
    "../repositories/cingArtilleryAccountRepository"
  );

const {
  assertUserId,
  normalizeAccountRecord,
} = require(
  "../domain/cingArtilleryContracts"
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

function mapAccountAdmissionError(
  error
) {
  const message =
    String(
      error?.message || ""
    );

  if (
    message.includes(
      "cing_artillery_disabled"
    )
  ) {
    return buildError({
      message:
        "Cing Artillery hiện chưa được mở",

      code:
        "CING_ARTILLERY_DISABLED",

      statusCode:
        503,
    });
  }

  if (
    message.includes(
      "cing_artillery_invalid_user_id"
    )
  ) {
    return buildError({
      message:
        "User identity Cing Artillery không hợp lệ",

      code:
        "CING_ARTILLERY_USER_ID_INVALID",

      statusCode:
        400,
    });
  }

  if (
    message.includes(
      "cing_artillery_account_creation_failed"
    )
  ) {
    return buildError({
      message:
        "Không thể khởi tạo tài khoản Cing Artillery",

      code:
        "CING_ARTILLERY_ACCOUNT_CREATION_FAILED",

      statusCode:
        500,
    });
  }

  return error;
}

async function getAccountByUserId(
  rawUserId
) {
  const userId =
    assertUserId(
      rawUserId
    );

  const account =
    await accountRepository
      .findByUserId(
        userId
      );

  return normalizeAccountRecord(
    account
  );
}

async function ensureAccount(
  rawUserId
) {
  const userId =
    assertUserId(
      rawUserId
    );

  try {
    const account =
      await accountRepository
        .getOrCreateAuthorized(
          userId
        );

    return normalizeAccountRecord(
      account
    );
  } catch (error) {
    throw mapAccountAdmissionError(
      error
    );
  }
}

module.exports = {
  getAccountByUserId,
  ensureAccount,
};
