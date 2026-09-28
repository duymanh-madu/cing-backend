"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const ROOT =
  path.resolve(__dirname, "../../../..");

function read(relative) {
  return fs.readFileSync(
    path.join(ROOT, relative),
    "utf8"
  );
}

const sql = read(
  "db/migrations/20260928_cing_offline_revive_safe_abandon_v1.sql"
);

const mirror = read(
  "supabase/migrations/20260928184500_cing_offline_revive_safe_abandon_v1.sql"
);

const repo = read(
  "services/games/revival/repositories/cingOfflineReviveRepository.js"
);

const service = read(
  "services/games/revival/cingOfflineReviveService.js"
);

const route = read(
  "routes/cingOfflineReviveRoutes.js"
);


test(
  "safe abandon migration mirror exact",
  () => {
    assert.equal(sql, mirror);
  }
);


test(
  "abandoned is distinct from scored finalized state",
  () => {
    assert.match(
      sql,
      /status\s+in\s*\([\s\S]*?'finalized'[\s\S]*?'abandoned'/i
    );

    assert.match(
      sql,
      /status\s*=\s*'abandoned'[\s\S]*?abandoned_at\s+is\s+not\s+null/i
    );

    assert.doesNotMatch(
      sql,
      /status\s*=\s*'abandoned'[\s\S]{0,220}?final_score\s*=/i
    );
  }
);


test(
  "abandon RPC is backend only",
  () => {
    assert.match(
      sql,
      /revoke\s+all[\s\S]*?cing_offline_revive_abandon_v1[\s\S]*?from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i
    );

    assert.match(
      sql,
      /grant\s+execute[\s\S]*?cing_offline_revive_abandon_v1[\s\S]*?to\s+service_role/i
    );
  }
);


test(
  "abandon mutates no financial authority and creates no score",
  () => {
    const executable =
      sql.replace(
        /\/\*[\s\S]*?\*\//g,
        ""
      );

    assert.doesNotMatch(
      executable,
      /insert\s+into\s+public\.game_scores/i
    );

    assert.doesNotMatch(
      executable,
      /cing_revive_credit_balances|cing_wallet|point_transactions|game_plays/i
    );
  }
);


test(
  "abandon is bound to owner request and event sequence",
  () => {
    assert.match(
      sql,
      /v_session\.user_id\s*<>\s*v_user_id/i
    );

    assert.match(
      sql,
      /v_session\.request_id\s*<>\s*p_request_id/i
    );

    assert.match(
      sql,
      /v_session\.event_seq\s*<>\s*p_expected_event_seq/i
    );
  }
);


test(
  "repository service and HTTP route use exact abandon RPC",
  () => {
    assert.match(
      repo,
      /cing_offline_revive_abandon_v1/
    );

    assert.match(
      service,
      /async function abandonOfflineRevival/
    );

    assert.match(
      route,
      /"\/session\/:session_id\/abandon"/
    );

    assert.match(
      route,
      /authMiddleware[\s\S]*?gameScoreLimiter[\s\S]*?abandonOfflineRevival/
    );
  }
);


test(
  "recovery recognizes abandoned terminal state",
  () => {
    assert.match(
      service,
      /session\.status !== "abandoned"/
    );

    assert.match(
      service,
      /abandoned_at:[\s\S]*?session\.abandoned_at/
    );
  }
);
