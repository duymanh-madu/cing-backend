const supabase =
  require("../supabase");

async function expireVouchers() {

  try {

    await supabase

      .from("user_vouchers")

      .update({

        voucher_status:
          "expired",

      })

      .eq(
        "voucher_status",
        "available"
      )

      .lt(
        "expired_at",
        new Date().toISOString()
      );

  } catch (error) {

    console.error(

      "expireVouchers error:",

      error.message

    );

  }

}

function startVoucherWorker() {

  setInterval(

    async () => {

      await expireVouchers();

    },

    1000 * 60 * 5

  );

}

module.exports = {

  startVoucherWorker,

};