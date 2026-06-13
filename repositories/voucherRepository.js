const supabase =
  require("../supabase");

async function findVoucher({

  voucher_code,

}) {

  const {

    data,

    error,

  } = await supabase

    .from("vouchers")

    .select("*")

    .eq(
      "voucher_code",
      voucher_code
    )

    .maybeSingle();

  if (error) {

    throw error;

  }

  return data;

}

module.exports = {

  findVoucher,

};