"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname,"../../../..");
const read = p => fs.readFileSync(path.join(root,p),"utf8");
const sql=read("db/migrations/20260927_cing_revive_admin_adjustment_status_v1.sql");
const mirror=read("supabase/migrations/20260927220000_cing_revive_admin_adjustment_status_v1.sql");
const route=read("routes/adminReviveCreditRoutes.js");
const service=read("services/games/revival/cingReviveCreditAdminAdjustmentService.js");
test("read-only SQL mirror, no balance mutation",()=>{
  assert.equal(sql,mirror);
  assert.match(sql,/create function public\.cing_revive_admin_adjustment_status_v1/);
  assert.doesNotMatch(sql,/\bupdate\s+public\.cing_revive_credit_balances\b/i);
  assert.doesNotMatch(sql,/\binsert\s+into\b/i);
  assert.match(sql,/t\.metadata->>'actor_id' = v_actor_id/);
  assert.match(sql,/v_count > 1/);
});
test("status access is service role only",()=>{
  assert.match(sql,/revoke all on function public\.cing_revive_admin_adjustment_status_v1/);
  assert.match(sql,/grant execute on function public\.cing_revive_admin_adjustment_status_v1\(uuid,text\)/);
  assert.match(sql,/to service_role/);
});
test("read-only route verifies verified super admin and actor",()=>{
  assert.match(route,/router\.get\(\s*"\/adjust\/status\/:request_id"/);
  assert.match(route,/requirePanelPermission\("revive\.credit\.adjust"\)/);
  assert.match(route,/req\.admin\?\.role !== "super_admin"/);
  assert.match(route,/actor_admin_id: actorId/);
  assert.doesNotMatch(route,/req\.query\.actor_admin_id|req\.body\.actor_admin_id/);
});
test("recovery query is distinct from financial mutation",()=>{
  assert.match(service,/"cing_revive_admin_adjustment_status_v1"/);
  assert.match(service,/"cing_revive_credit_admin_adjust_v1"/);
  assert.match(service,/status: "not_found"/);
});
