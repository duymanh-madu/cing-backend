const supabase =
  require("../supabase");

async function findTransaction({

  transaction_code,

}) {

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
      transaction_code
    )

    .maybeSingle();

  if (error) {

    throw error;

  }

  return data;

}

async function updateTransaction({

  transaction_id,

  payload,

}) {

  const {

    data,

    error,

  } = await supabase

    .from(
      "payment_transactions"
    )

    .update(payload)

    .eq(
      "id",
      transaction_id
    )

    .select("*")

    .maybeSingle();

  if (error) {

    throw error;

  }

  return data;

}

module.exports = {

  findTransaction,

  updateTransaction,

};