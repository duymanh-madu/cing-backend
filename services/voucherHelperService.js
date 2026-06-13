function isVoucherExpired(
  voucher
) {

  if (
    !voucher.expired_at
  ) {

    return false;

  }

  return (

    new Date(
      voucher.expired_at
    ).getTime() <

    Date.now()

  );

}

function generateVoucherCode({

  prefix = "VCH",

}) {

  return `${prefix}-${Date.now()}-${Math.floor(
    Math.random() * 9999
  )}`;

}

function calculateVoucherDiscount({

  voucher,

  subtotal,

}) {

  if (!voucher) {

    return 0;

  }

  /**
   * FIXED
   */

  if (

    voucher.voucher_type ===
    "fixed_amount"

  ) {

    return Math.min(

      subtotal,

      Number(
        voucher.discount_value || 0
      )

    );

  }

  /**
   * PERCENTAGE
   */

  if (

    voucher.voucher_type ===
    "percentage"

  ) {

    let discount =

      subtotal *

      (
        Number(
          voucher.discount_value || 0
        ) / 100
      );

    /**
     * MAX DISCOUNT
     */

    if (

      voucher.max_discount_amount

    ) {

      discount = Math.min(

        discount,

        Number(
          voucher.max_discount_amount
        )

      );

    }

    return Math.floor(
      discount
    );

  }

  return 0;

}

module.exports = {

  isVoucherExpired,

  generateVoucherCode,

  calculateVoucherDiscount,

};