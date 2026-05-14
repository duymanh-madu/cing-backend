const crypto =
  require("crypto");

const supabase =
  require("../supabase");

/**
 * ============================================
 * VERIFY SIGNATURE
 * ============================================
 */

function verifyWebhookSignature({

  raw_body,

  signature,

  secret,

}) {

  try {

    const hash =

      crypto

        .createHmac(
          "sha256",
          secret
        )

        .update(raw_body)

        .digest("hex");

    return hash === signature;

  } catch (error) {

    console.log(
      "verifyWebhookSignature error:",
      error.message
    );

    return false;

  }

}

/**
 * ============================================
 * LOG WEBHOOK
 * ============================================
 */

async function logWebhook({

  transaction_id,

  transaction_code,

  payment_provider,

  webhook_type,

  webhook_signature,

  signature_verified,

  request_headers,

  request_body,

  processing_status,

  processing_error,

}) {

  const {

    data,
    error,

  } = await supabase

    .from(
      "payment_webhooks"
    )

    .insert({

      transaction_id,

      transaction_code,

      payment_provider,

      webhook_type,

      webhook_signature,

      signature_verified,

      request_headers,

      request_body,

      processing_status,

      processing_error,

    })

    .select()

    .single();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

/**
 * ============================================
 * CHECK DUPLICATE WEBHOOK
 * ============================================
 */

async function isDuplicateWebhook({

  transaction_code,

  payment_provider,

}) {

  const {

    data,
    error,

  } = await supabase

    .from(
      "payment_webhooks"
    )

    .select("*")

    .eq(
      "transaction_code",
      transaction_code
    )

    .eq(
      "payment_provider",
      payment_provider
    )

    .eq(
      "processing_status",
      "processed"
    )

    .limit(1)

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return !!data;

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  verifyWebhookSignature,

  logWebhook,

  isDuplicateWebhook,

};