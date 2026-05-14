const eventBus =
  require(
    "../eventBus"
  );

const {
  useVoucher,
} = require(
  "../../../services/voucherService"
);

eventBus.register(

  "voucher.used",

  async ({
    user_voucher_id,
    order_id,
    order_code,
    discount_amount,
  }) => {

    await useVoucher({

      user_voucher_id,

      order_id,

      order_code,

      discount_amount,

    });

  }

);