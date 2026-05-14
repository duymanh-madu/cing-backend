const {
  useVoucher,
} = require(
  "../voucherService"
);

async function processVoucherUsage({

  validated_voucher,

  order,

  voucher_discount,

}) {

  try {

    if (

      !validated_voucher
        ?.user_voucher

    ) {

      return;

    }

    await useVoucher({

      user_voucher_id:

        validated_voucher
          .user_voucher
          .id,

      order_id:
        order.id,

      order_code:
        order.order_code,

      discount_amount:
        voucher_discount,

    });

  } catch (error) {

    console.error(

      "processVoucherUsage error:",

      error.message

    );

  }

}

module.exports = {

  processVoucherUsage,

};