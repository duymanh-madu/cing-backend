const supabase =
  require("../supabase");

const {

  generateVoucherCode,

} = require(
  "./voucherHelperService"
);

async function issueVoucher({

  user_id,

  template,

}) {

  const code =

    generateVoucherCode({

      prefix:
        template.voucher_prefix ||
        "VCH",

    });

  const {

    data,
    error,

  } = await supabase

    .from("user_vouchers")

    .insert({

      user_id,

      voucher_template_id:
        template.id,

      voucher_code:
        code,

      voucher_name:
        template.voucher_name,

      voucher_type:
        template.voucher_type,

      discount_value:
        template.discount_value,

      minimum_order_value:

        template.minimum_order_value,

      max_discount_amount:

        template.max_discount_amount,

      voucher_status:
        "available",

      expired_at:
        template.expired_at,

      created_at:
        new Date(),

      updated_at:
        new Date(),

    })

    .select("*")

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return {

    success: true,

    voucher: data,

  };

}

module.exports = {

  issueVoucher,

};