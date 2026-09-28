"use strict";

const ENABLE_FLAG = "CING_POINTS_REVIVE_IPOS_SYNC_WORKER_ENABLED";
const { processCingPointsReviveIposSyncQueue } = require(
  "./cingPointsReviveCreditIposSyncWorker"
);
let wake = null;
let interval = null;
function cycle() {
  Promise.resolve()
    .then(() => processCingPointsReviveIposSyncQueue({ batchSize: 10 }))
    .then(result => {
      if (result?.success === false) {
        console.warn("[CING REVIVE POINTS IPOS] queue cycle failed");
      }
    })
    .catch(() => console.warn("[CING REVIVE POINTS IPOS] queue cycle failed"));
}
function startCingPointsReviveIposSyncWorker() {
  if (process.env[ENABLE_FLAG] !== "true") return false;
  if (wake !== null || interval !== null) return false;
  wake = setTimeout(() => {
    wake = null;
    cycle();
  }, 45000);
  interval = setInterval(cycle, 60000);
  wake.unref?.();
  interval.unref?.();
  return true;
}
module.exports = { startCingPointsReviveIposSyncWorker };
