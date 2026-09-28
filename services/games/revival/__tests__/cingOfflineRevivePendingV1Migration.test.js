"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const sql = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260922_cing_offline_revive_pending_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260922230000_cing_offline_revive_pending_v1.sql"
  ),
  "utf8"
);

const source = sql.replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

test("pending RPC migration mirror is identical", () => {
  assert.equal(sql, mirror);
});

test("pending RPC uses PostgreSQL authority", () => {
  assert.match(
    source,
    /create function public\.cing_offline_revive_pending_v1/i
  );

  assert.match(source, /language plpgsql/i);
  assert.match(source, /security definer/i);
  assert.match(source, /set search_path = public/i);
});

test("session transition is serialized by row lock", () => {
  assert.match(
    source,
    /from public\.cing_offline_revive_sessions s[\s\S]*for update/i
  );

  assert.match(
    source,
    /v_session\.status <> 'active'/i
  );
});

test("request replay is checked after the session lock", () => {
  const lock = source.indexOf("for update;");
  const replay = source.indexOf(
    "from public.cing_offline_revive_events e"
  );

  assert.ok(lock >= 0);
  assert.ok(replay > lock);

  assert.match(
    source,
    /REVIVAL_PENDING_REFERENCE_CONFLICT/
  );

  assert.match(
    source,
    /REVIVAL_EVENT_SEQUENCE_CONFLICT/
  );
});

test("Stack Tower initial round uses 120 seconds", () => {
  assert.match(
    source,
    /v_session\.created_at \+ interval '120 seconds'/i
  );

  assert.match(
    source,
    /REVIVAL_TOWER_NOT_TIMED_OUT/
  );
});

test("Stack Tower later rounds use last revive plus 30 seconds", () => {
  assert.match(
    source,
    /e\.event_type = 'revived'/i
  );

  assert.match(
    source,
    /e\.revive_index = v_session\.revives_used/i
  );

  assert.match(
    source,
    /v_latest_revived_at \+ interval '30 seconds'/i
  );
});

test("timeout and death remain game-specific", () => {
  assert.match(
    source,
    /v_session\.game_key = 'cing-stack-tower'/i
  );

  assert.match(
    source,
    /v_reason <> 'timeout'/i
  );

  assert.match(
    source,
    /v_session\.game_key = 'black-pearl-rush'/i
  );

  assert.match(
    source,
    /v_reason <> 'death'/i
  );
});

test("pending records an event and advances sequence", () => {
  assert.match(
    source,
    /insert into public\.cing_offline_revive_events/i
  );

  assert.match(
    source,
    /v_next_seq := v_session\.event_seq \+ 1/i
  );

  assert.match(
    source,
    /set status = 'revive_pending'/i
  );
});

test("pending does not debit revive credits", () => {
  assert.doesNotMatch(
    source,
    /cing_revive_credit_apply_private_v1/i
  );

  assert.doesNotMatch(
    source,
    /update\s+public\.cing_revive_credit_balances/i
  );

  assert.doesNotMatch(
    source,
    /update\s+public\.players/i
  );
});

test("browser roles cannot execute pending RPC", () => {
  assert.match(
    source,
    /revoke all[\s\S]*from public, anon, authenticated, service_role/i
  );

  assert.match(
    source,
    /grant execute[\s\S]*to service_role/i
  );
});
