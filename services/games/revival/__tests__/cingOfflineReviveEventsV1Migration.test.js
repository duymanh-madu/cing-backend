"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const sql = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260922_cing_offline_revive_events_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260922220000_cing_offline_revive_events_v1.sql"
  ),
  "utf8"
);

const source = sql.replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

test("event migration mirror is identical", () => {
  assert.equal(mirror, sql);
});

test("events belong to durable offline sessions", () => {
  assert.match(
    source,
    /create table public\.cing_offline_revive_events/i
  );

  assert.match(
    source,
    /references public\.cing_offline_revive_sessions\(id\)/i
  );
});

test("same business request cannot create two events", () => {
  assert.match(
    source,
    /unique \(user_id, request_id\)/i
  );
});

test("session event sequence cannot fork", () => {
  assert.match(
    source,
    /unique \(session_id, event_seq\)/i
  );
});

test("revival event references exactly one debit ledger", () => {
  assert.match(
    source,
    /references public\.cing_revive_credit_transactions\(id\)/i
  );

  assert.match(
    source,
    /unique \(credit_transaction_id\)/i
  );

  assert.match(
    source,
    /when 1 then 1[\s\S]*when 5 then 16/i
  );
});

test("events cover pending, revived and finalized", () => {
  for (const event of [
    "revive_pending",
    "revived",
    "finalized",
  ]) {
    assert.ok(source.includes(`'${event}'`));
  }
});

test("service role cannot write event history", () => {
  assert.match(
    source,
    /revoke all[\s\S]*from public, anon, authenticated, service_role/i
  );

  assert.match(
    source,
    /grant select[\s\S]*to service_role/i
  );
});

test("migration cannot change balances or old game sessions", () => {
  assert.doesNotMatch(
    source,
    /update\s+public\.cing_revive_credit_balances/i
  );

  assert.doesNotMatch(
    source,
    /update\s+public\.players/i
  );

  assert.doesNotMatch(
    source,
    /alter table\s+public\.cing_block_puzzle_sessions/i
  );
});
