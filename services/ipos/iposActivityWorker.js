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
      .not("phone", "is", null)
      .lt("received_at", cutoff)
      .order("received_at", { ascending: true })
      .limit(20);

    if (error) throw new Error(error.message);

    let resynced = 0;
    for (const row of stuckRows || []) {
      try {
        await syncSingleUserSpending(row.phone);
        await supabase.from("ipos_webhook_log").update({ synced: true }).eq("id", row.id);
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
