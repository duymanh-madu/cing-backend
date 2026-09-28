"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.CING_C4CB_ROOT || path.resolve(__dirname, "../../../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const sql = read("db/migrations/20260928_cing_crm_order_reward_recovery_v1.sql");
const mirror = read("supabase/migrations/20260928030000_cing_crm_order_reward_recovery_v1.sql");
const worker = read("services/game/cingCrmOrderRewardRecoveryWorker.js");
const scheduler = read("services/crm/crmSyncRecoveryWorker.js");

test("recovery SQL exact mirrored and depends on C4B/C4CA", () => {
  assert.equal(sql, mirror);
  assert.match(sql, /C4CB_REQUIRES_C4B_AND_C4CA/);
});
test("recovery claims pending rows via database SKIP LOCKED", () => {
  assert.match(sql, /for update skip locked limit p_batch_size/i);
  assert.match(sql, /public\.cing_crm_order_spend_plays_atomic_v1\(/);
  assert.match(sql, /begin\s+select \* into v_order/);
  assert.match(sql, /exception when others/);
});
test("only server-side recovery function can mark queue delivered", () => {
  assert.match(sql, /revoke update \(status,attempts,last_reason,last_attempt_at,next_retry_at,delivered_at\)/);
  assert.match(sql, /revoke all on function public\.cing_crm_order_reward_recover_batch_v1/);
  assert.match(sql, /grant execute on function public\.cing_crm_order_reward_recover_batch_v1/);
});
test("recovery is OFF by default and Bridge V2 owned", () => {
  assert.match(
    worker,
    /CING_CRM_REWARD_RECOVERY_ENABLED === "true"/
  );

  assert.match(
    worker,
    /cing_bridge_crm_revive_recover_batch_v1/
  );

  assert.doesNotMatch(
    worker,
    /cing_crm_order_reward_recover_batch_v1/
  );

  assert.doesNotMatch(
    worker,
    /isLegacyGamePlaysMutationDisabled/
  );

  assert.match(
    scheduler,
    /CING_CRM_REWARD_RECOVERY_ENABLED === "true"/
  );

  assert.match(
    scheduler,
    /startCingCrmOrderRewardRecoveryWorker\(\)/
  );
});
test("CRM sync ACK is not coupled to game reward retry", () => {
  assert.match(scheduler, /await completeJob\(job\)/);
  assert.doesNotMatch(worker, /ipos_webhook_log|crm_sync_queue|spending_synced/);
});
