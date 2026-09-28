"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const sql = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260922_cing_offline_revive_apply_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260922233000_cing_offline_revive_apply_v1.sql"
  ),
  "utf8"
);

const source = sql.replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

test("atomic revival migration mirror is identical", () => {
  assert.equal(sql, mirror);
});

test("revival RPC runs under PostgreSQL authority", () => {
  assert.match(
    source,
    /create function public\.cing_offline_revive_apply_v1/i
  );

  assert.match(source, /language plpgsql/i);
  assert.match(source, /security definer/i);
  assert.match(source, /set search_path = public/i);
});

test("session row lock serializes revival requests", () => {
  assert.match(
    source,
    /from public\.cing_offline_revive_sessions s[\s\S]*for update/i
  );

  assert.match(
    source,
    /v_session\.status <> 'revive_pending'/i
  );

  assert.match(
    source,
    /v_session\.event_seq <> p_expected_event_seq/i
  );
});

test("durable replay is checked after session lock", () => {
  const lock = source.indexOf("for update;");
  const replay = source.indexOf(
    "from public.cing_offline_revive_events e"
  );

  assert.ok(lock >= 0);
  assert.ok(replay > lock);

  assert.match(
    source,
    /REVIVAL_APPLY_REFERENCE_CONFLICT/
  );

  assert.match(
    source,
    /REVIVAL_APPLY_HISTORY_INCONSISTENT/
  );
});

test("each revival binds its exact pending event", () => {
  assert.match(
    source,
    /e\.id = p_pending_event_id/i
  );

  assert.match(
    source,
    /e\.session_id = p_session_id/i
  );

  assert.match(
    source,
    /e\.event_type = 'revive_pending'/i
  );

  assert.match(
    source,
    /e\.event_seq = p_expected_event_seq/i
  );

  assert.match(
    source,
    /REVIVAL_PENDING_EVENT_MISMATCH/
  );
});

test("database determines five costs without client price", () => {
  assert.match(
    source,
    /v_session\.revives_used >= 5/i
  );

  assert.match(
    source,
    /when 1 then 1[\s\S]*when 2 then 2[\s\S]*when 3 then 4[\s\S]*when 4 then 8[\s\S]*when 5 then 16/i
  );

  assert.match(
    source,
    /REVIVAL_LIMIT_REACHED/
  );

  assert.doesNotMatch(
    source,
    /p_credit_cost|p_revive_index/i
  );
});

test("credit debit precedes event and session update", () => {
  const debit = source.indexOf(
    "from public.cing_revive_credit_apply_private_v1("
  );

  const event = source.indexOf(
    "insert into public.cing_offline_revive_events ("
  );

  const session = source.indexOf(
    "update public.cing_offline_revive_sessions s"
  );

  assert.ok(debit >= 0);
  assert.ok(event > debit);
  assert.ok(session > event);

  assert.match(
    source,
    /REVIVAL_CREDIT_APPLY_INCONSISTENT/
  );
});

test("revived event binds the credit transaction", () => {
  assert.match(
    source,
    /'offline_revive'/i
  );

  assert.match(
    source,
    /'pending_event_id', p_pending_event_id/i
  );

  assert.match(
    source,
    /'revived',\s*v_next_index,\s*v_cost,\s*v_credit_tx_id/i
  );
});

test("successful revival returns session to active", () => {
  assert.match(
    source,
    /set status = 'active'/i
  );

  assert.match(
    source,
    /revives_used = v_next_index/i
  );

  assert.match(
    source,
    /pending_reason = null,\s*pending_at = null/i
  );
});

test("no Wallet, loyalty or legacy-play mutation", () => {
  assert.doesNotMatch(
    source,
    /public\.cing_wallet_/i
  );

  assert.doesNotMatch(
    source,
    /update\s+public\.players/i
  );

  assert.doesNotMatch(
    source,
    /update\s+public\.point_transactions/i
  );
});

test("browser roles cannot execute revival RPC", () => {
  assert.match(
    source,
    /revoke all[\s\S]*from public, anon, authenticated, service_role/i
  );

  assert.match(
    source,
    /grant execute[\s\S]*to service_role/i
  );
});
