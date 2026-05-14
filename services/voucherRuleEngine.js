async function validateVoucherRules({

  voucher,

  user_id,

  subtotal,

  payment_method,

}) {

  /**
   * MIN ORDER
   */

  if (

    Number(subtotal) <

    Number(
      voucher.minimum_order_value || 0
    )

  ) {

    return {

      success: false,

      message:
        "Chưa đạt giá trị tối thiểu",

    };

  }

  /**
   * PAYMENT METHOD
   */

  if (

    Array.isArray(
      voucher.allowed_payment_methods
    ) &&

    voucher.allowed_payment_methods
      .length > 0 &&

    !voucher.allowed_payment_methods.includes(
      payment_method
    )

  ) {

    return {

      success: false,

      message:
        "Voucher không hỗ trợ phương thức thanh toán này",

    };

  }

  return {

    success: true,

  };

}

module.exports = {

  validateVoucherRules,

};