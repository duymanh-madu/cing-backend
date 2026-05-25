const supabase =
  require("../supabase");

async function startPaymentTimeoutWorker() {

  setInterval(
    async () => {

      try {

        const {

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
            "payment_status",
            "pending"
          )

          .lt(
            "expired_at",
            new Date().toISOString()
          );

        if (error) {

          console.log(
            "PAYMENT TIMEOUT ERROR:",
            error.message
          );

        }

      } catch (error) {

        console.log(
          "PAYMENT TIMEOUT WORKER ERROR:",
          error.message
        );

      }

    },
    1000 * 30
  );

}

module.exports = {

  startPaymentTimeoutWorker,

};