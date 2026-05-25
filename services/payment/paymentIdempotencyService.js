const supabase =
  require("../../supabase");

async function isPaymentAlreadyProcessed({
  transaction_code,
}) {

  const {
    data,
    error,
  } = await supabase

    .from(
      "payment_transactions"
    )

    .select(`
      id,
      payment_status,
      paid_at
    `)

    .eq(
      "transaction_code",
      transaction_code
    )

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  if (!data) {

    return false;

  }

  return (
    data.payment_status ===
    "paid"
  );

}

module.exports = {

  isPaymentAlreadyProcessed,

};