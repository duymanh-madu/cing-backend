const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    "utf8"
  );
}

test("iPOS webhook rejects non-phone membership identity before activity logging", () => {
  const src = read("routes/iposWebhookRoutes.js");

  assert.ok(
    src.includes("function isCustomerPhone(phone) {"),
    "customer phone validator must exist"
  );

  assert.ok(
    src.includes('return /^(0|84)\\d{8,10}$/.test(String(phone || ""));'),
    "customer phone validator must preserve the canonical phone contract"
  );

  const invalidGate =
    src.indexOf("if (!isCustomerPhone(phone))");

  const activityInsert =
    src.indexOf('.from("ipos_webhook_log").insert(');

  assert.ok(
    invalidGate >= 0,
    "customer phone validity gate must exist"
  );

  assert.ok(
    activityInsert >= 0,
    "ipos_webhook_log insert must exist"
  );

  assert.ok(
    invalidGate < activityInsert,
    "invalid customer identity must be rejected before ipos_webhook_log insert"
  );

  assert.match(
    src,
    /Customer sync skipped: non-phone iPOS identity/
  );
});

test("activity recovery only marks webhook synced after successful CRM result", () => {
  const src = read("services/ipos/iposActivityWorker.js");

  const syncCall =
    src.indexOf(
      "const syncResult = await syncSingleUserSpending(row.phone);"
    );

  const resultGate =
    src.indexOf(
      "if (!syncResult || syncResult.success !== true)"
    );

  const markSynced =
    src.indexOf('.update({ synced: true })');

  const increment =
    src.indexOf("resynced++;");

  assert.ok(syncCall >= 0, "CRM sync result must be captured");
  assert.ok(resultGate > syncCall, "CRM result must be validated");
  assert.ok(markSynced > resultGate, "synced write must follow success validation");
  assert.ok(increment > markSynced, "resynced count must follow durable synced write");

  assert.match(
    src,
    /const \{ error: markSyncedError \} = await supabase/
  );

  assert.match(
    src,
    /if \(markSyncedError\)/
  );
});

test("known non-phone iPOS membership identifier cannot satisfy customer phone contract", () => {
  const candidate = "024120010000011";
  const isCustomerPhone =
    /^(0|84)\d{8,10}$/.test(candidate);

  assert.equal(isCustomerPhone, false);
});

test("webhook preserves idempotent order/game side effects before surfacing CRM logical failure", () => {
  const src = read("routes/iposWebhookRoutes.js");

  const syncCall = src.indexOf(
    "const syncResult = await syncSingleUserSpending(p0);"
  );

  assert.ok(syncCall >= 0, "webhook CRM sync call must exist");

  const successGate = src.indexOf(
    "if (!syncResult || syncResult.success !== true)",
    syncCall
  );
  const captureFailure = src.indexOf(
    "crmSyncError = new Error(",
    successGate
  );
  const orderForPlays = src.indexOf(
    "const orderForPlays =",
    captureFailure
  );
  const directOrderCodeForPlays = src.indexOf(
    "const directOrderCodeForPlays =",
    orderForPlays
  );
  const fallbackOrder = src.indexOf(
    '.from("crm_orders")',
    directOrderCodeForPlays
  );
  const gameAward = src.indexOf(
    "await awardOrderGamePlays({",
    directOrderCodeForPlays
  );
  const delayedFailureGate = src.indexOf(
    "if (crmSyncError)",
    gameAward
  );
  const delayedThrow = src.indexOf(
    "throw crmSyncError;",
    delayedFailureGate
  );
  const clearRecovery = src.indexOf(
    "await clearMomoPaidCrmRecoveryJob(p0, event);",
    delayedThrow
  );
  const activityLog = src.indexOf(
    '.from("ipos_webhook_log")',
    clearRecovery
  );
  const updateSynced = src.indexOf(
    ".update({ synced: true })",
    activityLog
  );

  assert.ok(
    successGate > syncCall,
    "CRM logical result must be validated after sync"
  );
  assert.ok(
    captureFailure > successGate,
    "CRM logical failure must be captured rather than thrown immediately"
  );
  assert.ok(
    orderForPlays > captureFailure,
    "order/game processing must remain reachable after CRM failure capture"
  );
  assert.ok(
    directOrderCodeForPlays > orderForPlays,
    "direct order identity must be derived after CRM failure capture"
  );
  assert.ok(
    fallbackOrder > directOrderCodeForPlays,
    "fallback crm_orders authority must remain reachable"
  );
  assert.ok(
    gameAward > directOrderCodeForPlays,
    "game award authority must remain reachable"
  );
  assert.ok(
    delayedFailureGate > gameAward,
    "CRM failure must surface only after game/order side effects"
  );
  assert.ok(
    delayedThrow > delayedFailureGate,
    "captured CRM failure must be thrown"
  );
  assert.ok(
    clearRecovery > delayedThrow,
    "momo_paid recovery must not clear before captured CRM failure is surfaced"
  );
  assert.ok(
    updateSynced > clearRecovery,
    "activity ACK must remain after recovery clear"
  );

  assert.ok(
    !src.includes(
      'throw new Error("CRM spending sync not confirmed: " + reason)'
    ),
    "CRM logical failure must not throw before order/game side effects"
  );
});

test("webhook only ACKs CRM activity after confirmed spending sync", () => {
  const src = read("routes/iposWebhookRoutes.js");

  const syncCall = src.indexOf(
    "const syncResult = await syncSingleUserSpending(p0);"
  );
  const successGate = src.indexOf(
    "if (!syncResult || syncResult.success !== true)"
  );
  const clearRecovery = src.indexOf(
    "await clearMomoPaidCrmRecoveryJob(p0, event);"
  );
  const markSynced = src.indexOf(
    '.from("ipos_webhook_log")',
    clearRecovery
  );
  const updateSynced = src.indexOf(
    ".update({ synced: true })",
    markSynced
  );
  const markErrorGate = src.indexOf(
    "if (markSyncedError)",
    updateSynced
  );

  assert.ok(syncCall >= 0, "webhook CRM sync result must be captured");
  assert.ok(
    successGate > syncCall,
    "webhook must require explicit CRM sync success"
  );
  assert.ok(
    clearRecovery > successGate,
    "momo_paid recovery must not clear before CRM success gate"
  );
  assert.ok(
    updateSynced > clearRecovery,
    "activity ACK must occur only after confirmed CRM path"
  );
  assert.ok(
    markErrorGate > updateSynced,
    "activity ACK database error must be checked"
  );

  const standaloneDiscardedSync = src
    .split("\n")
    .some(
      line =>
        line.trim() === "await syncSingleUserSpending(p0);"
    );

  assert.equal(
    standaloneDiscardedSync,
    false,
    "webhook must not discard the logical CRM sync result"
  );

  assert.ok(
    !src.includes(
      '.update({ synced: true }).eq("id", _logId).then(()=>{}).catch(()=>{})'
    ),
    "webhook must not swallow durable ACK failures"
  );
});
