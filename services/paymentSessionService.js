const crypto =
  require("crypto");

const supabase =
  require("../supabase");

/**
 * =====================================
 * GENERATE CODE
 * =====================================
 */

function generateTransactionCode() {

  return `PAY-${Date.now()}-${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;

}

/**
 * =====================================
 * CREATE PAYMENT SESSION
 * =====================================
 */

async function createPaymentSession({

  user_id,

  amount,

  payment_method,

  cart_snapshot,

}) {

  /**
   * GENERATE CODE
   */

  const transaction_code =
    generateTransactionCode();

  /**
   * EXPIRE
   */

  const expired_at =
    new Date(
      Date.now() +
        15 * 60 * 1000
    );

  /**
   * INSERT
   */

  const {

    data,

    error,

  } = await supabase

    .from(
      "payment_transactions"
    )

    .insert({

      user_id,

      transaction_code,

      payment_provider:
        payment_method,

      payment_method,

      amount,

      cart_snapshot,

      payment_status:
        "pending",

      payment_session_status:
        "created",

      expired_at,

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

module.exports = {

  createPaymentSession,

};