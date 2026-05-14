const supabase =
  require("../supabase");

async function markVoucherUsed({

  voucher_id,

  order_id,

}) {

  const {

    data,
    error,

  } = await supabase

    .from("user_vouchers")

    .update({

      voucher_status:
        "used",

      used_at:
        new Date(),

      order_id,

      updated_at:
        new Date(),

    })

    .eq(
      "id",
      voucher_id
    )

    .select("*")

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

module.exports = {

  markVoucherUsed,

};