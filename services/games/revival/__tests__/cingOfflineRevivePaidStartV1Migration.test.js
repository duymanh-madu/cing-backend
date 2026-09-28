"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(
  __dirname,
  "../../../.."
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    "utf8"
  );
}

const sql = read(
  "db/migrations/" +
  "20260923_cing_offline_revive_paid_start_v1.sql"
);

const mirror = read(
  "supabase/migrations/" +
  "20260923004500_cing_offline_revive_paid_start_v1.sql"
);

const historical = read(
  "db/migrations/" +
  "20260922_cing_offline_revive_start_v1.sql"
);

const source = sql.replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

function position(pattern) {
  const match = pattern.exec(source);

  assert.ok(
    match,
    `Missing SQL contract: ${pattern}`
  );

  return match.index;
}

test(
  "paid start mirror remains byte-identical",
  () => {
    assert.equal(sql, mirror);
  }
);

test(
  "historical free start migration remains separate",
  () => {
    assert.match(
      historical,
      /create function public\.cing_offline_revive_start_v1/i
    );

    assert.doesNotMatch(
      historical.replace(
        /\/\*[\s\S]*?\*\//g,
        ""
      ),
      /game_plays/i
    );

    assert.match(
      source,
      /create or replace function\s+public\.cing_offline_revive_start_v1/i
    );
  }
);

test(
  "RPC identity and response contract are retained",
  () => {
    assert.match(
      source,
      /p_user_id text,\s*p_request_id uuid,\s*p_game_key text/i
    );

    assert.match(
      source,
      /returns table\s*\(\s*applied boolean,\s*session_id uuid,\s*game_key text,\s*session_status text,\s*revives_used integer,\s*event_seq integer,\s*expires_at timestamptz\s*\)/i
    );
  }
);

test(
  "only Stack Tower and Black Pearl can start",
  () => {
    assert.match(
      source,
      /'cing-stack-tower'/
    );

    assert.match(
      source,
      /'black-pearl-rush'/
    );

    assert.doesNotMatch(
      source,
      /'cing-block-puzzle'/
    );
  }
);

test(
  "paid-offline policy remains database-owned",
  () => {
    assert.match(
      source,
      /from public\.app_configs a/i
    );

    assert.match(
      source,
      /game_economy_config/i
    );

    assert.match(
      source,
      /'economy_type'/i
    );

    assert.match(
      source,
      /v_economy_type <> 'paid_offline'/i
    );
  }
);

test(
  "player lock precedes debit",
  () => {
    const lock = position(
      /from public\.players p\s+where p\.user_id = v_user_id\s+for update/i
    );

    const debit = position(
      /update public\.players p\s+set game_plays/i
    );

    assert.ok(lock < debit);
  }
);

test(
  "a second replay check follows the player lock",
  () => {
    const lock = position(
      /from public\.players p\s+where p\.user_id = v_user_id\s+for update/i
    );

    const debit = position(
      /update public\.players p\s+set game_plays/i
    );

    const replayChecks = Array.from(
      source.matchAll(
        /from public\.cing_offline_revive_sessions s\s+where s\.user_id = v_user_id\s+and s\.request_id = p_request_id/gi
      )
    );

    assert.equal(
      replayChecks.length,
      2
    );

    assert.ok(
      replayChecks[0].index < lock
    );

    assert.ok(
      replayChecks[1].index > lock
    );

    assert.ok(
      replayChecks[1].index < debit
    );
  }
);

test(
  "both replay paths verify durable debit identity",
  () => {
    const checks = Array.from(
      source.matchAll(
        /'REVIVAL_START_LEDGER_MISSING'/g
      )
    );

    assert.equal(
      checks.length,
      2
    );

    assert.match(
      source,
      /t\.session_id = v_existing\.id/
    );

    assert.match(
      source,
      /t\.transaction_type = 'deduct'/
    );

    assert.match(
      source,
      /t\.amount = -1/
    );
  }
);

test(
  "insufficient plays fail before balance mutation",
  () => {
    const insufficient = position(
      /'NO_GAME_PLAYS'/
    );

    const debit = position(
      /update public\.players p\s+set game_plays/i
    );

    assert.ok(
      insufficient < debit
    );
  }
);

test(
  "session ledger and analytics follow one debit",
  () => {
    const debit = position(
      /update public\.players p\s+set game_plays/i
    );

    const session = position(
      /insert into public\.cing_offline_revive_sessions/i
    );

    const ledger = position(
      /insert into public\.game_play_transactions/i
    );

    const analytics = position(
      /insert into public\.analytics_events/i
    );

    assert.ok(debit < session);
    assert.ok(session < ledger);
    assert.ok(ledger < analytics);

    assert.match(
      source,
      /'plays_deducted'/
    );

    assert.match(
      source,
      /'game_session'/
    );

    assert.match(
      source,
      /'request_id'/
    );
  }
);

test(
  "session identity is PostgreSQL-generated",
  () => {
    assert.match(
      source,
      /gen_random_uuid\(\)/
    );

    assert.match(
      source,
      /interval '4 hours'/
    );
  }
);

test(
  "resource boundaries remain isolated",
  () => {
    assert.doesNotMatch(
      source,
      /cing_revive_credit_apply_private_v1/i
    );

    assert.doesNotMatch(
      source,
      /public\.cing_wallet_/i
    );

    assert.doesNotMatch(
      source,
      /point_transactions/i
    );
  }
);

test(
  "execution remains backend-only",
  () => {
    assert.match(
      source,
      /security definer/i
    );

    assert.match(
      source,
      /set search_path = public/i
    );

    assert.match(
      source,
      /revoke all[\s\S]*from public, anon, authenticated, service_role/i
    );

    assert.match(
      source,
      /grant execute[\s\S]*to service_role/i
    );
  }
);

test(
  "migration has an explicit transaction boundary",
  () => {
    assert.match(
      source,
      /^\s*begin\s*;/i
    );

    assert.match(
      source,
      /commit\s*;\s*$/i
    );

    assert.match(
      source,
      /\bend;\s*\$\$;/i
    );
  }
);
