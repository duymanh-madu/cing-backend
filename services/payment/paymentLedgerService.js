class PaymentLedgerService {

  constructor() {
    this.ledger = [];
  }

  record(entry) {

    this.ledger.push({
      id: `${Date.now()}_${Math.random()}`,
      ...entry,
      ts: Date.now()
    });

  }

  all() {
    return this.ledger;
  }

}

module.exports = new PaymentLedgerService();
