const syncQueue = require("../payment/paymentQueueService"); // reuse infra if available

class SyncGateway {

  async push(iposData, crmData, meta = {}) {

    const job = {
      id: `${Date.now()}_${Math.random()}`,
      ipos: iposData,
      crm: crmData,
      meta,
      ts: Date.now()
    };

    await syncQueue.enqueue?.(job) || this.fallback(job);

    return job;

  }

  fallback(job) {
    console.log("[SYNC GATEWAY FALLBACK]", job);
  }

}

module.exports = new SyncGateway();
