"use strict";

const repository =
  require(
    "../repositories/cingArtilleryEffectiveGameplayAccessRepository"
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

function assertCanonicalUserId(
  rawUserId
) {
  if (
    typeof rawUserId !==
    "string"
  ) {
    throw buildError({
      message:
        "User identity Cing Artillery không hợp lệ",

      code:
        "CING_ARTILLERY_USER_ID_INVALID",

      statusCode:
        400,
    });
  }

  const userId =
    rawUserId.trim();

  if (!userId) {
    throw buildError({
      message:
        "User identity Cing Artillery không hợp lệ",

      code:
        "CING_ARTILLERY_USER_ID_INVALID",

      statusCode:
        400,
    });
  }

  return userId;
}

async function hasEffectiveGameplayAccess(
  rawUserId
) {
  const userId =
    assertCanonicalUserId(
      rawUserId
    );

  return repository
    .hasEffectiveGameplayAccess(
      userId
    );
}

async function requireEffectiveGameplayAccess(
  rawUserId
) {
  const allowed =
    await hasEffectiveGameplayAccess(
      rawUserId
    );

  if (!allowed) {
    throw buildError({
      message:
        "Cing Artillery hiện chưa được mở",

      code:
        "CING_ARTILLERY_DISABLED",

      statusCode:
        503,
    });
  }

  return true;
}

module.exports = {
  assertCanonicalUserId,
  hasEffectiveGameplayAccess,
  requireEffectiveGameplayAccess,
};
