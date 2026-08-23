const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const path =
  require("path");

const migration =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20260823_cing_block_puzzle_replay_v3_capability.sql"
    ),
    "utf8"
  );

test(
  "V3 capability permits only exact V1 V2 and replay V3 tuples",
  () => {
    assert.match(
      migration,
      /engine_version = 1[\s\S]*rules_version = 1[\s\S]*score_version = 1[\s\S]*replay_version = 1/
    );

    assert.match(
      migration,
      /engine_version = 2[\s\S]*rules_version = 2[\s\S]*score_version = 2[\s\S]*replay_version = 2/
    );

    assert.match(
      migration,
      /engine_version = 2[\s\S]*rules_version = 2[\s\S]*score_version = 2[\s\S]*replay_version = 3/
    );
  }
);

test(
  "V3 migration transforms current RPC authorities instead of reconstructing stale bodies",
  () => {
    assert.match(
      migration,
      /pg_get_functiondef/
    );

    assert.match(
      migration,
      /regexp_replace/
    );

    assert.match(
      migration,
      /game_play_transactions/
    );

    assert.match(
      migration,
      /analytics_events/
    );

    assert.match(
      migration,
      /BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT/
    );

    assert.match(
      migration,
      /server_replay_v%s/
    );
  }
);

test(
  "V3 capability preserves private RPC ACL",
  () => {
    assert.match(
      migration,
      /from public, anon, authenticated/
    );

    assert.match(
      migration,
      /to service_role/
    );
  }
);

test(
  "V3 capability does not activate application issuer",
  () => {
    assert.doesNotMatch(
      migration,
      /update\s+public\.app_configs/i
    );

    assert.doesNotMatch(
      migration,
      /cingBlockPuzzleSessionContracts/i
    );
  }
);
