async function broadcastVoucherIssued({

  voucher,

}) {

  try {

    const io =
      global.io;

    if (!io) {

      return;
    }

    io.to(

      `user:${voucher.user_id}`

    ).emit(

      "voucher_issued",

      voucher

    );

  } catch (error) {

    console.error(

      "broadcastVoucherIssued error:",

      error.message

    );

  }

}

module.exports = {

  broadcastVoucherIssued,

};