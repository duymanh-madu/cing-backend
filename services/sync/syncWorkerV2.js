const dedup = require("./syncDedupEngine");
const resolver = require("./syncConflictResolver");

class SyncWorkerV2 {

  async process(job) {

    const key = job.ipos.customerId;

    if (dedup.isDuplicate(key)) {
      return { status: "SKIPPED_DUPLICATE" };
    }

    const result = resolver.resolve(job.ipos, job.crm);

    dedup.mark(key);

    console.log("[SYNC OK]", result);

    return result;

  }

}

module.exports = new SyncWorkerV2();
const trace = require("../observability/traceEngine");
