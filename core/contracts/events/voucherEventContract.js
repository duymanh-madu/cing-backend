const {
  buildEvent,
} = require(
  "./baseEventContract"
);

function buildVoucherUsedEvent(
  payload
) {

  return buildEvent({

    event_name:
      "voucher.used",

    source:
      "voucher-domain",

    payload,

  });

}

module.exports = {

  buildVoucherUsedEvent,

};