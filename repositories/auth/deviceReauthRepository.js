const supabase = require("../../supabase");

const TABLE = "cing_device_reauth_sessions";

async function rotateCredential({
  customerId,
  bindingId,
  selector,
  tokenHash,
  expiresAt,
}) {
  const payload = {
    customer_id: String(customerId),
    binding_id: String(bindingId),
    token_selector: selector,
    token_hash: tokenHash,
    expires_at: expiresAt,
    revoked_at: null,
    last_used_at: null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, {
      onConflict: "customer_id,binding_id",
      ignoreDuplicates: false,
    })
    .select(
      "id, customer_id, binding_id, token_selector, token_hash, expires_at, revoked_at"
    )
    .single();

  if (error) {
    throw new Error(
      `device_reauth_rotate_failed: ${error.message}`
    );
  }

  return data;
}

async function consumeAndRotate({
  currentSelector,
  currentTokenHash,
  bindingId,
  nextSelector,
  nextTokenHash,
  nextExpiresAt,
}) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_device_reauth_consume_rotate_v1",
    {
      p_current_selector:
        currentSelector,
      p_current_token_hash:
        currentTokenHash,
      p_binding_id:
        bindingId,
      p_next_selector:
        nextSelector,
      p_next_token_hash:
        nextTokenHash,
      p_next_expires_at:
        nextExpiresAt,
    }
  );

  if (error) {
    throw new Error(
      `device_reauth_consume_rotate_failed: ${error.message}`
    );
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  if (
    !row?.session_id ||
    !row?.customer_id
  ) {
    return null;
  }

  return {
    id:
      row.session_id,
    customerId:
      row.customer_id,
  };
}

async function revokeCustomer({ customerId }) {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from(TABLE)
    .update({
      revoked_at: now,
      updated_at: now,
    })
    .eq("customer_id", String(customerId))
    .is("revoked_at", null);

  if (error) {
    throw new Error(
      `device_reauth_revoke_failed: ${error.message}`
    );
  }
}

module.exports = {
  rotateCredential,
  consumeAndRotate,
  revokeCustomer,
};
