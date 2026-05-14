class MemoryQueueAdapter {

  constructor() {

    this.jobs = [];

  }

  async add(job) {

    this.jobs.push({

      id:
        crypto.randomUUID(),

      status:
        "pending",

      attempts: 0,

      created_at:
        new Date(),

      ...job,

    });

  }

  async getPending() {

    return this.jobs.filter(

      (job) =>

        job.status ===
        "pending"

    );

  }

  async markCompleted(
    job_id
  ) {

    const job =

      this.jobs.find(

        (item) =>

          item.id ===
          job_id

      );

    if (job) {

      job.status =
        "completed";

    }

  }

}

module.exports =
  MemoryQueueAdapter;