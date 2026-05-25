class PaymentFlowEnforcerService {

  enforce(flow, context) {

    for (const step of flow) {

      if (!context[step]) {
        throw new Error(`PAYMENT FLOW BROKEN AT: ${step}`);
      }

    }

    return {
      status: "FLOW_VALID"
    };

  }

}

module.exports = new PaymentFlowEnforcerService();
