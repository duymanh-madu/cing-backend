const repository =
  require(
    "../repositories/cingArtilleryMutableAuthorityRepository"
  );

function buildError({
  message,
  code,
  statusCode,
  cause,
}) {
  const error =
    new Error(
      message
    );

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

function assertCombatStateId(
  value
) {
  const normalized =
    String(
      value || ""
    ).trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(
        normalized
      )
  ) {
    throw buildError({
      message:
        "Combat State ID Cing Artillery không hợp lệ",
      code:
        "CING_ARTILLERY_COMBAT_STATE_ID_INVALID",
      statusCode:
        400,
    });
  }

  return normalized;
}

async function bootstrapForCombatState(
  rawCombatStateId
) {
  const combatStateId =
    assertCombatStateId(
      rawCombatStateId
    );

  try {
    const authority =
      await repository
        .bootstrapAtomic(
          combatStateId
        );

    if (
      !authority ||
      authority.ready !== true ||
      authority.combat_state_id !==
        combatStateId ||
      authority.player_world_count !==
        2 ||
      !authority.terrain_state_id ||
      !authority.player_one_world_state_id ||
      !authority.player_two_world_state_id
    ) {
      throw buildError({
        message:
          "Mutable combat authority Cing Artillery chưa sẵn sàng",
        code:
          "CING_ARTILLERY_MUTABLE_AUTHORITY_NOT_READY",
        statusCode:
          500,
      });
    }

    return authority;
  } catch (error) {
    if (
      error?.code ===
        "CING_ARTILLERY_MUTABLE_AUTHORITY_NOT_READY" ||
      error?.code ===
        "CING_ARTILLERY_COMBAT_STATE_ID_INVALID"
    ) {
      throw error;
    }

    throw buildError({
      message:
        "Không thể bootstrap mutable combat authority Cing Artillery",
      code:
        "CING_ARTILLERY_MUTABLE_AUTHORITY_BOOTSTRAP_FAILED",
      statusCode:
        500,
      cause:
        error,
    });
  }
}

module.exports = {
  bootstrapForCombatState,
};
