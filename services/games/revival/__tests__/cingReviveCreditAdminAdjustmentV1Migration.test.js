"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const source = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260924_cing_revive_credit_admin_adjustment_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260924194000_cing_revive_credit_admin_adjustment_v1.sql"
  ),
  "utf8"
);

const executable = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*/g, "");

test("admin adjustment SQL mirror is identical", () => {
  assert.equal(source, mirror);
});

test("authority requires active super_admin", () => {
  assert.match(
    executable,
    /from public\.admins a[\s\S]*a\.role = 'super_admin'[\s\S]*a\.active is true/i
  );

  assert.match(
    executable,
    /REVIVE_SUPER_ADMIN_REQUIRED/
  );
});

test("amount and request identity are mandatory", () => {
  assert.match(
    executable,
    /p_amount is null or p_amount = 0/i
  );

  assert.match(
    executable,
    /p_request_id is null/i
  );
});

test("reason, note and actor are mandatory", () => {
  for (const code of [
    "REVIVE_ADMIN_REASON_CODE_INVALID",
    "REVIVE_ADMIN_NOTE_INVALID",
    "REVIVE_ADMIN_ACTOR_REQUIRED",
  ]) {
    assert.match(executable, new RegExp(code));
  }
});

test("audit metadata binds actor and request", () => {
  assert.match(
    executable,
    /'actor_type',\s*'admin'/
  );

  assert.match(
    executable,
    /'actor_id',\s*v_actor_id/
  );

  assert.match(
    executable,
    /'request_id',\s*p_request_id/
  );

  assert.match(
    executable,
    /'reason_code',\s*v_reason_code/
  );

  assert.match(
    executable,
    /'note',\s*v_note/
  );
});

test("idempotency uses existing private mutation", () => {
  assert.match(
    executable,
    /cing_revive_credit_apply_private_v1\s*\(/
  );

  assert.match(
    executable,
    /'revive_admin_adjustment_v1',\s*p_request_id::text/
  );
});

test("no direct balance, Wallet or point mutation", () => {
  assert.doesNotMatch(
    executable,
    /\bupdate\s+public\.cing_revive_credit_balances\b/i
  );

  assert.doesNotMatch(
    executable,
    /\b(?:insert into|update|delete from)\s+public\.(?:players|wallets|cing_wallets|point_transactions|game_play_transactions)\b/i
  );
});

test("customer roles cannot execute admin adjustment", () => {
  assert.match(
    executable,
    /revoke all[\s\S]*from public, anon, authenticated, service_role/i
  );

  assert.match(
    executable,
    /grant execute[\s\S]*to service_role/i
  );

  assert.doesNotMatch(
    executable,
    /grant execute[\s\S]*to (?:anon|authenticated)\s*;/i
  );
});

test("migration does not invoke the adjustment", () => {
  assert.doesNotMatch(
    executable,
    /\bselect\s+\*\s+from\s+public\.cing_revive_credit_admin_adjust_v1/i
  );
});
