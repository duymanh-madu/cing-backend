"use strict";

const supabase =
  require(
    "../../../../supabase"
  );

const TABLE =
  "cing_artillery_accounts";

const ACCOUNT_FIELDS =
  [
    "id",
    "user_id",
    "status",
    "created_at",
    "updated_at",
  ].join(",");

const GET_OR_CREATE_AUTHORIZED_RPC =
  "cing_artillery_get_or_create_account_authorized_v1";

async function findByUserId(
  userId
) {
  const {
    data,
    error,
  } = await supabase
    .from(TABLE)
    .select(
      ACCOUNT_FIELDS
    )
    .eq(
      "user_id",
      userId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getOrCreateAuthorized(
  userId
) {
  const {
    data,
    error,
  } = await supabase
    .rpc(
      GET_OR_CREATE_AUTHORIZED_RPC,
      {
        p_user_id:
          userId,
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
  ACCOUNT_FIELDS,
  GET_OR_CREATE_AUTHORIZED_RPC,
  findByUserId,
  getOrCreateAuthorized,
};
