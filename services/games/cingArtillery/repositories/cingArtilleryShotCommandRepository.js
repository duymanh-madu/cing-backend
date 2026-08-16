const supabase =
  require(
    "../../../../supabase"
  );

const RPC_NAME =
  "cing_artillery_accept_shot_command_with_execution_atomic";

async function acceptAtomic({
  combatStateId,
  shooterAccountId,
  shooterSessionId,
  turnNumber,
  commandId,
  angleDeg,
  power,
}) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      RPC_NAME,
      {
        p_combat_state_id:
          combatStateId,

        p_shooter_account_id:
          shooterAccountId,

        p_shooter_session_id:
          shooterSessionId,

        p_turn_number:
          turnNumber,

        p_command_id:
          commandId,

        p_angle_deg:
          angleDeg,

        p_power:
          power,
      }
    );

  if (error) {
    throw error;
  }

  return Array.isArray(data)
    ? data[0] || null
    : data || null;
}

module.exports = {
  acceptAtomic,
};
