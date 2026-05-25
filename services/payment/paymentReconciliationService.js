const supabase =
  require("../../supabase");

async function createReconciliationSnapshot({

  transaction_code,

  payment_status,

  provider_transaction_id,

}) {

  const {

    error,

  } = await supabase

    .from(
      "payment_reconciliation_snapshots"
    )

    .insert({

      transaction_code,

      payment_status,

      provider_transaction_id,

      snapshot_at:
        new Date().toISOString(),

    });

  if (error) {

    console.log(
      "RECONCILIATION ERROR:",
      error.message
    );

  }

}

module.exports = {

  createReconciliationSnapshot,

};