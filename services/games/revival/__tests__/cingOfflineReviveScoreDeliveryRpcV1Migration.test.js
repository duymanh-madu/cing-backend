"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../..");

const PRIMARY = path.join(
  ROOT,
  "db/migrations/20260923_cing_offline_revive_score_delivery_rpc_v1.sql"
);

const MIRROR = path.join(
  ROOT,
  "supabase/migrations/20260923001500_cing_offline_revive_score_delivery_rpc_v1.sql"
);

const source =
  fs.readFileSync(PRIMARY, "utf8");

const mirror =
  fs.readFileSync(MIRROR, "utf8");

test(
  "delivery RPC migration mirrors are identical",
  () => {
    assert.equal(source, mirror);
  }
);

test(
  "migration uses PostgreSQL transaction",
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
  "claim uses row lock with skip locked",
  () => {
    assert.match(
      source,
      /for update skip locked/i
    );

    assert.match(
      source,
      /limit 1/i
    );
  }
);

test(
  "claim generates a new worker token",
  () => {
    assert.match(
      source,
      /worker_token\s*=\s*gen_random_uuid\(\)/i
    );
  }
);

test(
  "expired processing jobs can be reclaimed",
  () => {
    assert.match(
      source,
      /status = 'processing'[\s\S]*?locked_until <= v_now/i
    );
  }
);

test(
  "stage progression is durable and ordered",
  () => {
    assert.match(
      source,
      /'analytics',\s*'leaderboard',\s*'top1'/i
    );

    assert.match(
      source,
      /REVIVAL_SCORE_STAGE_ORDER_INVALID/i
    );

    assert.match(
      source,
      /analytics_done = v_analytics/i
    );

    assert.match(
      source,
      /leaderboard_done = v_leaderboard/i
    );

    assert.match(
      source,
      /top1_done = v_top1/i
    );
  }
);

test(
  "delivery requires every stage",
  () => {
    assert.match(
      source,
      /v_complete :=\s*v_analytics\s+and v_leaderboard\s+and v_top1/i
    );

    assert.match(
      source,
      /when v_complete then 'delivered'/i
    );
  }
);

test(
  "lease fencing protects ack and fail",
  () => {
    const fence =
      /worker_token = p_worker_token[\s\S]*?status = 'processing'[\s\S]*?locked_until > clock_timestamp\(\)/gi;

    const matches =
      source.match(fence) || [];

    assert.ok(
      matches.length >= 3,
      "claim owner must be checked by renew, ack and fail"
    );
  }
);

test(
  "failed jobs are retained for inspection",
  () => {
    assert.match(
      source,
      /attempt_count >= 6[\s\S]*?'failed'/i
    );

    assert.match(
      source,
      /last_error\s*=\s*left\(p_error,\s*1000\)/i
    );
  }
);

test(
  "only service role receives worker RPC access",
  () => {
    const grants =
      source.match(
        /grant execute[\s\S]*?to service_role\s*;/gi
      ) || [];

    assert.equal(
      grants.length,
      4
    );

    assert.match(
      source,
      /from public, anon, authenticated,\s*service_role/i
    );
  }
);

test(
  "no direct game score or financial mutations",
  () => {
    assert.doesNotMatch(
      source,
      /\binsert into\s+public\.game_scores\b/i
    );

    assert.doesNotMatch(
      source,
      /\bupdate\s+public\.(?:wallets|cing_wallets|players|cing_revive_credit_balances)\b/i
    );

    assert.doesNotMatch(
      source,
      /\bsaveGameScore\s*\(/i
    );
  }
);
