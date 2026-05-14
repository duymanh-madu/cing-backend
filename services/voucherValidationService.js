const supabase =
  require("../supabase");

const {

  validateVoucherRules,

} = require(
  "./voucherRuleEngine"
);

const {

  isVoucherExpired,

  calculateVoucherDiscount,

} = require(
  "./voucherHelperService"
);

async function validateVoucher({

  user_id,

  voucher_code,

  subtotal,

  payment_method,

}) {

  /**
   * FIND USER VOUCHER
   */

  const {

    data: voucher,

    error,

  } = await supabase

    .from("user_vouchers")

    .select("*")

    .eq(
      "user_id",
      user_id
    )

    .eq(
      "voucher_code",
      voucher_code
    )

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  if (!voucher) {

    return {

      success: false,

      message:
        "Voucher không tồn tại",

    };

  }

  /**
   * STATUS
   */

  if (

    voucher.voucher_status !==
    "available"

  ) {

    return {

      success: false,

      message:
        "Voucher không khả dụng",

    };

  }

  /**
   * EXPIRED
   */

  if (
    isVoucherExpired(
      voucher
    )
  ) {

    return {

      success: false,

      message:
        "Voucher đã hết hạn",

    };

  }

  /**
   * RULE ENGINE
   */

  const ruleResult =

    await validateVoucherRules({

      voucher,

      user_id,

      subtotal,

      payment_method,

    });

  if (
    !ruleResult.success
  ) {

    return ruleResult;

  }

  /**
   * CALCULATE
   */

  const discount_amount =

    calculateVoucherDiscount({

      voucher,

      subtotal,

    });

  return {

    success: true,

    voucher,

    discount_amount,

  };

}

module.exports = {

  validateVoucher,

};