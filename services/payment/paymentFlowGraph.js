class PaymentFlowGraph {

  getFlow() {
    return [
      "transaction",
      "idempotency",
      "lock",
      "orchestrator",
      "provider",
      "reconciliation",
      "audit",
      "eventBus"
    ];
  }

}

module.exports = new PaymentFlowGraph();
