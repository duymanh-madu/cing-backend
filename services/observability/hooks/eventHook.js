class ObservabilityEventHook {

  constructor() {
    this.metrics = {
      payment: 0,
      crmSync: 0,
      errors: 0,
      latency: []
    };
  }

  recordPayment(success = true) {
    this.metrics.payment += success ? 1 : 0;
  }

  recordCRM(success = true) {
    this.metrics.crmSync += success ? 1 : 0;
  }

  recordError() {
    this.metrics.errors += 1;
  }

  recordLatency(ms) {
    this.metrics.latency.push(ms);

    if (this.metrics.latency.length > 100) {
      this.metrics.latency.shift();
    }
  }

  snapshot() {
    return this.metrics;
  }

}

module.exports = new ObservabilityEventHook();
