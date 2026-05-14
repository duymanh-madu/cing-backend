const {
  emitToUser,
} = require(
  "../socketEmitService"
);

async function emitVoucherClaimed({

  user_id,

  voucher,

}) {

  emitToUser({

    user_id,

    event:
      "voucher_claimed",

    payload:
      voucher,

  });

}

module.exports = {

  emitVoucherClaimed,

};