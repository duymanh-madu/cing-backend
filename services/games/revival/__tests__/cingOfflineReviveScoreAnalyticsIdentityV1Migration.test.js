"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../..");

const primary = fs.readFileSync(
  path.join(
    ROOT,
    "db/migrations/20260923_cing_offline_revive_score_analytics_identity_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20260923002500_cing_offline_revive_score_analytics_identity_v1.sql"
  ),
  "utf8"
);

test(
  "analytics identity SQL mirrors match",
  () => {
    assert.equal(primary, mirror);
  }
);

test(
  "analytics identity migration is transactional",
  () => {
    assert.match(
      primary,
      /^\s*begin\s*;/i
    );

    assert.match(
      primary,
      /\bcommit\s*;\s*$/i
    );
  }
);

test(
  "migration validates actual analytics schema",
  () => {
    assert.match(
      primary,
      /information_schema\.columns/i
    );

    assert.match(
      primary,
      /table_name = 'analytics_events'/i
    );

    assert.match(
      primary,
      /'json', 'jsonb'/i
    );
  }
);

test(
  "analytics identity uses source score ID",
  () => {
    assert.match(
      primary,
      /create unique index\s+analytics_events_offline_revive_score_uidx/i
    );

    assert.match(
      primary,
      /event_data\s*->>\s*'offline_revive_score_id'/i
    );
  }
);

test(
  "uniqueness applies only to game score events",
  () => {
    assert.match(
      primary,
      /where event_name = 'game_score'/i
    );
  }
);

test(
  "legacy events without score ID are excluded",
  () => {
    assert.match(
      primary,
      /nullif\(\s*event_data\s*->>\s*'offline_revive_score_id',\s*''\s*\)\s+is not null/i
    );
  }
);

test(
  "migration rejects existing identity duplicates",
  () => {
    assert.match(
      primary,
      /having count\(\*\) > 1/i
    );

    assert.match(
      primary,
      /REVIVAL_ANALYTICS_SCORE_IDENTITY_DUPLICATED/i
    );
  }
);

test(
  "migration does not rewrite analytics history",
  () => {
    assert.doesNotMatch(
      primary,
      /\bdelete from\s+public\.analytics_events\b/i
    );

    assert.doesNotMatch(
      primary,
      /\bupdate\s+public\.analytics_events\b/i
    );

    assert.doesNotMatch(
      primary,
      /\binsert into\s+public\.analytics_events\b/i
    );
  }
);

test(
  "migration does not mutate gameplay or finance",
  () => {
    assert.doesNotMatch(
      primary,
      /\b(?:insert into|update|delete from)\s+public\.game_scores\b/i
    );

    assert.doesNotMatch(
      primary,
      /\b(?:insert into|update|delete from)\s+public\.(?:wallets|cing_wallets|players|cing_revive_credit_balances)\b/i
    );
  }
);
