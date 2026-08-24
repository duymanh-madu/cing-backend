"use strict";

const supabase =
  require(
    "../../../../supabase"
  );

const TABLE =
  "cing_artillery_gameplay_sessions";

const SESSION_FIELDS =
  [
    "id",
    "account_id",
    "status",
    "started_at",
    "ended_at",
    "created_at",
    "updated_at",
  ].join(",");

const GET_OR_CREATE_AUTHORIZED_RPC =
  "cing_artillery_get_or_create_gameplay_session_authorized_v1";

async function findActiveByAccountId(
  accountId
) {
  const {
    data,
    error,
  } = await supabase
    .from(TABLE)
    .select(
      SESSION_FIELDS
    )
    .eq(
      "account_id",
      accountId
    )
    .eq(
      "status",
      "active"
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getOrCreateAuthorized(
  accountId
) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      GET_OR_CREATE_AUTHORIZED_RPC,
      {
        p_account_id:
          accountId,
      }
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function endAtomic({
  accountId,
  sessionId,
  status,
}) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      "cing_artillery_end_gameplay_session_atomic",
      {
        p_account_id:
          accountId,

        p_session_id:
          sessionId,

        p_status:
          status,
      }
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  TABLE,
  SESSION_FIELDS,
  GET_OR_CREATE_AUTHORIZED_RPC,
  findActiveByAccountId,
  getOrCreateAuthorized,
  endAtomic,
};
