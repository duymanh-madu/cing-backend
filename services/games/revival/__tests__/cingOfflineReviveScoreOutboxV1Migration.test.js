"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../..");

const primary = fs.readFileSync(
  path.join(
    ROOT,
    "db/migrations/20260923_cing_offline_revive_score_outbox_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20260923000500_cing_offline_revive_score_outbox_v1.sql"
  ),
  "utf8"
);

test(
  "score outbox SQL mirrors are identical",
  () => {
    assert.equal(primary, mirror);
  }
);

test(
  "score outbox migration is transactional",
  () => {
    assert.match(primary, /^\s*begin\s*;/i);

    assert.match(
      primary,
      /\bcommit\s*;\s*$/i
    );
  }
);

test(
  "score delivery is uniquely bound to score and session",
  () => {
    assert.match(
      primary,
      /score_id bigint primary key/i
    );

    assert.match(
      primary,
      /session_id uuid not null unique/i
    );

    assert.match(
      primary,
      /references public\.game_scores\(id\)/i
    );

    assert.match(
      primary,
      /cing_offline_revive_sessions\(id\)/i
    );
  }
);

test(
  "outbox only accepts the two generic offline games",
  () => {
    assert.match(
      primary,
      /game_key in\s*\(\s*'cing-stack-tower'\s*,\s*'black-pearl-rush'/i
    );
  }
);

test(
  "outbox maintains durable stage progress",
  () => {
    for (const column of [
      "analytics_done",
      "leaderboard_done",
      "top1_done",
      "attempt_count",
      "next_attempt_at",
      "locked_until",
      "worker_token",
      "delivered_at",
    ]) {
      assert.match(
        primary,
        new RegExp(
          `\\b${column}\\b`,
          "i"
        )
      );
    }
  }
);

test(
  "delivered status requires every effect",
  () => {
    assert.match(
      primary,
      /status = 'delivered'[\s\S]*?analytics_done[\s\S]*?leaderboard_done[\s\S]*?top1_done[\s\S]*?delivered_at is not null/i
    );
  }
);

test(
  "outbox is inserted by an AFTER INSERT trigger",
  () => {
    assert.match(
      primary,
      /create trigger[\s\S]*?after insert[\s\S]*?on public\.game_scores/i
    );

    assert.match(
      primary,
      /when\s*\(\s*new\.offline_revive_session_id is not null\s*\)/i
    );

    assert.match(
      primary,
      /new\.id[\s\S]*?new\.offline_revive_session_id[\s\S]*?new\.game_key[\s\S]*?new\.user_id/i
    );
  }
);

test(
  "trigger never calls legacy score persistence",
  () => {
    assert.doesNotMatch(
      primary,
      /\bsaveGameScore\s*\(/i
    );

    assert.doesNotMatch(
      primary,
      /\bcomplete_daily_challenge_atomic\s*\(/i
    );
  }
);

test(
  "browser roles cannot access score outbox",
  () => {
    assert.match(
      primary,
      /revoke all[\s\S]*?cing_offline_revive_score_outbox[\s\S]*?from public, anon, authenticated/i
    );

    assert.match(
      primary,
      /grant select[\s\S]*?to service_role/i
    );
  }
);

test(
  "outbox does not mutate credit or wallet balances",
  () => {
    assert.doesNotMatch(
      primary,
      /\bupdate\s+(?:public\.)?(?:cing_revive_credit_balances|cing_wallets|wallets|players)\b/i
    );
  }
);
