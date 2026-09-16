const supabase = require("../../supabase");
const { syncSingleUserSpending } = require("../crm/crmSpendingSyncService");
const { sendAdminAlert } = require("../alerts/adminAlertService");
const {
  registerScheduler, markSchedulerStarted, markSchedulerSuccess, markSchedulerError,
} = require("../scheduler/schedulerHealthService");

const INTERVAL_MS = 5 * 60 * 1000;
const STUCK_MINUTES = 5;

async function runIposActivityCheck() {
  try {
    const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000).toISOString();

    const { data: stuckRows, error } = await supabase
      .from("ipos_webhook_log")
      .select("id, phone, event, received_at")
      .eq("synced", false)
      .is("terminal_at", null)
      .not("phone", "is", null)
      .lt("received_at", cutoff)
      .order("received_at", { ascending: true })
      .limit(20);

    if (error) throw new Error(error.message);

    let resynced = 0;
    for (const row of stuckRows || []) {
      try {
        const isCustomerPhone =
          /^(0|84)\d{8,10}$/.test(String(row.phone || ""));

        if (!isCustomerPhone) {
          const { error: markTerminalError } = await supabase
            .from("ipos_webhook_log")
            .update({
              terminal_at: new Date().toISOString(),
              terminal_reason: "non_phone_identity",
            })
            .eq("id", row.id)
            .eq("synced", false)
            .is("terminal_at", null);

          if (markTerminalError) {
            throw new Error(
              "failed to mark webhook terminal: " +
              markTerminalError.message
            );
          }

          console.warn(
            "[IPOS ACTIVITY] Terminal non-phone identity skipped",
            {
              id: row.id,
              event: row.event,
            }
          );
          continue;
        }

        const syncResult = await syncSingleUserSpending(row.phone);

        if (!syncResult || syncResult.success !== true) {
          const reason =
            syncResult?.error ||
            (syncResult === null ? "invalid customer phone" : "CRM sync returned unsuccessful result");

          console.warn("[IPOS ACTIVITY] Re-sync failed for " + row.phone + ":", reason);
          continue;
        }

        const { error: markSyncedError } = await supabase
          .from("ipos_webhook_log")
          .update({ synced: true })
          .eq("id", row.id);

        if (markSyncedError) {
          throw new Error("failed to mark webhook synced: " + markSyncedError.message);
        }

        resynced++;
        console.log("[IPOS ACTIVITY] Auto re-synced " + row.phone + " (event: " + row.event + ", stuck " + STUCK_MINUTES + "min+)");
        await new Promise(r => setTimeout(r, 300));
      } catch(e) {
        console.warn("[IPOS ACTIVITY] Re-sync failed for " + row.phone + ":", e.message);
      }
    }

    if (resynced > 0) {
      await sendAdminAlert({
        title: "🔁 Auto re-sync đơn iPOS bị trễ",
        message: "Tự động re-sync " + resynced + " giao dịch iPOS bị trễ sync (>" + STUCK_MINUTES + " phút). Hệ thống đã tự khắc phục.",
        source: "ipos_activity_resync",
      }).catch(()=>{});
    }

    markSchedulerSuccess("ipos_activity_worker", { resynced, checked: (stuckRows||[]).length });
    return { success:true, resynced };
  } catch(e) {
    markSchedulerError("ipos_activity_worker", e);
    return { success:false, error:e.message };
  }
}

function startIposActivityWorker() {
  registerScheduler({ key:"ipos_activity_worker", name:"iPOS Activity Sync Worker", interval_ms: INTERVAL_MS, type:"worker" });
  markSchedulerStarted("ipos_activity_worker");
  console.log("[IPOS ACTIVITY] worker started, interval: 5 min");

  setTimeout(() => runIposActivityCheck(), 60*1000);
  setInterval(() => runIposActivityCheck(), INTERVAL_MS);
}

module.exports = { startIposActivityWorker, runIposActivityCheck };
