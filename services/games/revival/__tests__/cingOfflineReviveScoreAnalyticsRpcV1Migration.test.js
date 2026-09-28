"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../..");

const source = fs.readFileSync(
  path.join(
    ROOT,
    "db/migrations/20260923_cing_offline_revive_score_analytics_rpc_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20260923003500_cing_offline_revive_score_analytics_rpc_v1.sql"
  ),
  "utf8"
);

test(
  "atomic analytics SQL mirrors match",
  () => {
    assert.equal(source, mirror);
  }
);

test(
  "analytics RPC migration is transactional",
  () => {
    assert.match(
      source,
      /^\s*begin\s*;/i
    );

    assert.match(
      source,
      /\bcommit\s*;\s*$/i
    );
  }
);

test(
  "RPC accepts only score identity and worker token",
  () => {
    assert.match(
      source,
      /cing_offline_revive_score_analytics_v1\(\s*p_score_id bigint,\s*p_worker_token uuid/i
    );

    assert.doesNotMatch(
      source,
      /\bp_final_score\b/i
    );
  }
);

test(
  "RPC locks the current lease owner",
  () => {
    assert.match(
      source,
      /o\.worker_token = p_worker_token/i
    );

    assert.match(
      source,
      /o\.locked_until > clock_timestamp\(\)/i
    );

    assert.match(
      source,
      /for update\s*;/i
    );
  }
);

test(
  "score is loaded from PostgreSQL binding",
  () => {
    assert.match(
      source,
      /from public\.game_scores g/i
    );

    assert.match(
      source,
      /g\.offline_revive_session_id\s*=\s*v_job\.session_id/i
    );

    assert.match(
      source,
      /g\.game_key = v_job\.game_key/i
    );

    assert.match(
      source,
      /g\.user_id = v_job\.user_id/i
    );
  }
);

test(
  "historical best uses Vietnam week",
  () => {
    assert.match(
      source,
      /Asia\/Ho_Chi_Minh/i
    );

    assert.match(
      source,
      /date_trunc\(\s*'week'/i
    );

    assert.match(
      source,
      /g\.id < v_score\.id/i
    );
  }
);

test(
  "analytics keeps legacy game score payload",
  () => {
    for (const name of [
      "game_key",
      "score",
      "previous_alltime_best",
      "previous_weekly_best",
      "offline_revive_score_id",
    ]) {
      assert.ok(
        source.includes(`'${name}'`),
        `missing analytics payload: ${name}`
      );
    }
  }
);

test(
  "analytics insert tolerates idempotent replay",
  () => {
    assert.match(
      source,
      /on conflict do nothing/i
    );

    assert.match(
      source,
      /REVIVAL_SCORE_ANALYTICS_IDENTITY_CONFLICT/i
    );
  }
);

test(
  "analytics insert and ACK share one RPC",
  () => {
    assert.match(
      source,
      /insert into public\.analytics_events/i
    );

    assert.match(
      source,
      /analytics_done = true/i
    );

    assert.match(
      source,
      /REVIVAL_SCORE_ANALYTICS_LEASE_EXPIRED/i
    );
  }
);

test(
  "only service role may execute analytics RPC",
  () => {
    assert.match(
      source,
      /revoke all[\s\S]*?from public, anon, authenticated,\s*service_role/i
    );

    assert.match(
      source,
      /grant execute[\s\S]*?to service_role/i
    );
  }
);

test(
  "RPC does not write scores or financial balances",
  () => {
    assert.doesNotMatch(
      source,
      /\binsert into\s+public\.game_scores\b/i
    );

    assert.doesNotMatch(
      source,
      /\bupdate\s+public\.(?:game_scores|wallets|cing_wallets|players|cing_revive_credit_balances)\b/i
    );

    assert.doesNotMatch(
      source,
      /\bcomplete_daily_challenge_atomic\s*\(/i
    );

    assert.doesNotMatch(
      source,
      /\bsaveGameScore\s*\(/i
    );
  }
);
