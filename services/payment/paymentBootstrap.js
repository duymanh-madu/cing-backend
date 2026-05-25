const paymentOrchestratorService = require("./paymentOrchestratorService");
const paymentStateMachine = require("./paymentStateMachine");

class PaymentBootstrap {

  init() {

    console.log("[PAYMENT] Bootstrapping flow...");

    paymentStateMachine.init?.();

    paymentOrchestratorService.init?.();

    console.log("[PAYMENT] Ready");

  }

}

module.exports = new PaymentBootstrap();
