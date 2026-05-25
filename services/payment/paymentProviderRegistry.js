const momoProvider =
  require("./providers/momoProvider");

const bankingProvider =
  require("./providers/bankingProvider");

const registry = {

  momo:
    momoProvider,

  banking:
    bankingProvider,

};

function getPaymentProvider(
  provider
) {

  const normalized =
    String(provider || "")
      .trim()
      .toLowerCase();

  const paymentProvider =
    registry[
      normalized
    ];

  if (!paymentProvider) {

    throw new Error(
      `Unsupported payment provider: ${provider}`
    );

  }

  return paymentProvider;

}

module.exports = {

  getPaymentProvider,

};