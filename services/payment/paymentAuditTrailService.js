const supabase =
  require("../../supabase");

async function createPaymentAuditLog({

  transaction_code,

  action,

  metadata,

}) {

  const {

    error,

  } = await supabase

    .from(
      "payment_audit_logs"
    )

    .insert({

      transaction_code,

      action,

      metadata,

      created_at:
        new Date().toISOString(),

    });

  if (error) {

    console.log(
      "PAYMENT AUDIT ERROR:",
      error.message
    );

  }

}

module.exports = {

  createPaymentAuditLog,

};