const crypto =
  require("crypto");

global.crypto =
  crypto;

const MemoryQueueAdapter =
  require(
    "./adapters/memoryQueueAdapter"
  );

class QueueManager {

  constructor() {

    this.adapter =
      new MemoryQueueAdapter();

  }

  async addJob(job) {

    return this.adapter.add(
      job
    );

  }

  async getPendingJobs() {

    return this.adapter.getPending();

  }

  async completeJob(
    job_id
  ) {

    return this.adapter.markCompleted(
      job_id
    );

  }

}

module.exports =
  new QueueManager();