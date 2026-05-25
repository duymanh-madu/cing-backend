const crypto =
  require("crypto");

const supabase =
  require("../../supabase");

function generateTransactionCode() {

  return `PAY-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;

}

async function createTransaction({

  user_id,

  payment_provider,

  payment_method,

  amount,

  cart_snapshot,

  expired_at,

}) {

  const transaction_code =
    generateTransactionCode();

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

      payment_provider,

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

async function updateTransaction({

  transactionId,

  values,

}) {

  const {

    data,
    error,

  } = await supabase

    .from(
      "payment_transactions"
    )

    .update(values)

    .eq(
      "id",
      transactionId
    )

    .select()

    .single();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

async function findTransactionByCode(
  transactionCode
) {

  const {

    data,
    error,

  } = await supabase

    .from(
      "payment_transactions"
    )

    .select("*")

    .eq(
      "transaction_code",
      transactionCode
    )

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

module.exports = {

  createTransaction,

  updateTransaction,

  findTransactionByCode,

};