class PaymentRiskGuardService {

  validate(payment) {

    if (!payment.amount || payment.amount <= 0) {
      throw new Error("INVALID_AMOUNT");
    }

    if (!payment.orderId) {
      throw new Error("MISSING_ORDER_ID");
    }

    return true;

  }

}

module.exports = new PaymentRiskGuardService();
