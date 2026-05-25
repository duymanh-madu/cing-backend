const syncQueue = require("../services/queue/syncQueue");
const crmIposSyncService = require("../services/sync/crmIposSyncService");

class CrmSyncWorker {

  running = false;

  async start() {
    this.running = true;
    this.loop();
  }

  async loop() {

    while (this.running) {

      const job = await syncQueue.pop();

      if (!job) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      try {

        const result = crmIposSyncService.merge(
          job.ipos,
          job.crm
        );

        console.log("[CRM SYNC OK]", result);

        // TODO: save to DB (Supabase / Postgres)
        job.result = result;

      } catch (err) {
        console.error("[CRM SYNC ERROR]", err);
      }

    }

  }

}

module.exports = new CrmSyncWorker();
