const supabase =
  require("../../supabase");

async function getRealtimePayments({

  limit = 50,

}) {

  const {

    data,
    error,

  } = await supabase

    .from(
      "payment_transactions"
    )

    .select("*")

    .order(
      "created_at",
      {
        ascending: false,
      }
    )

    .limit(limit);

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

async function getPendingPayments() {

  const {

    data,
    error,

  } = await supabase

    .from(
      "payment_transactions"
    )

    .select("*")

    .eq(
      "payment_status",
      "pending"
    )

    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

async function expirePayment({

  transaction_code,

}) {

  const {

    data,
    error,

  } = await supabase

    .from(
      "payment_transactions"
    )

    .update({

      payment_status:
        "expired",

    })

    .eq(
      "transaction_code",
      transaction_code
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

module.exports = {

  getRealtimePayments,

  getPendingPayments,

  expirePayment,

};