class PaymentEnforcer {

  async execute(flow, context) {

    for (const step of flow) {

      if (!context[step]) {
        throw new Error(`Payment flow broken at: ${step}`);
      }

    }

    return true;

  }

}

module.exports = new PaymentEnforcer();
