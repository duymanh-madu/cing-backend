"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../../..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const db = read("db/migrations/20260927_cing_points_revive_ipos_queue_authority_v1.sql");
const mirror = read("supabase/migrations/20260927180000_cing_points_revive_ipos_queue_authority_v1.sql");
const worker = read("services/games/revival/cingPointsReviveCreditIposSyncWorker.js");
const server = read("server.js");
test("queue migration mirrored and purchase RPC stays dormant", () => {
  assert.equal(db, mirror);
  assert.match(db, /for update skip locked/i);
  assert.match(db, /ipos_claim_token\s*=\s*p_claim_token/i);
  assert.match(db, /ipos_claim_token is distinct from p_claim_token/i);
  assert.match(db, /POINTS_REVIVE_QUEUE_OWNER_LOST/);
  assert.match(db, /to service_role/i);
  assert.doesNotMatch(db, /grant\s+update\s+on\s+table/i);
  assert.doesNotMatch(db, /grant\s+execute\s+on\s+function\s+public\.cing_points_purchase_revive_credits_v1/i);
});
test("worker uses only narrow RPC for queue transitions", () => {
  assert.match(worker, /supabase\.rpc\(QUEUE_RPC/);
  assert.doesNotMatch(worker, /\.update\(\{/);
  assert.match(worker, /await assertClaimOwned\(row\)/);
});
test("worker scheduler does not import when OFF", () => {
  assert.match(server, /if \(process\.env\.CING_POINTS_REVIVE_IPOS_SYNC_WORKER_ENABLED === "true"\)/);
  assert.match(server, /startCingPointsReviveIposSyncWorker/);
});
