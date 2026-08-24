const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const path =
  require("path");

const root =
  path.join(
    __dirname,
    "../../../.."
  );

const migration =
  fs.readFileSync(
    path.join(
      root,
      "db/migrations/20260824_cing_block_puzzle_v4_capability.sql"
    ),
    "utf8"
  );

const issuer =
  fs.readFileSync(
    path.join(
      __dirname,
      "../domain/cingBlockPuzzleSessionContracts.js"
    ),
    "utf8"
  );

test(
  "V4 capability adds exact 3 3 3 4 session tuple while preserving legacy tuples",
  () => {
    assert.match(
      migration,
      /engine_version\s*=\s*1[\s\S]*rules_version\s*=\s*1[\s\S]*score_version\s*=\s*1[\s\S]*replay_version\s*=\s*1/i
    );

    assert.match(
      migration,
      /engine_version\s*=\s*2[\s\S]*rules_version\s*=\s*2[\s\S]*score_version\s*=\s*2[\s\S]*replay_version\s*=\s*2/i
    );

    assert.match(
      migration,
      /engine_version\s*=\s*2[\s\S]*rules_version\s*=\s*2[\s\S]*score_version\s*=\s*2[\s\S]*replay_version\s*=\s*3/i
    );

    assert.match(
      migration,
      /engine_version\s*=\s*3[\s\S]*rules_version\s*=\s*3[\s\S]*score_version\s*=\s*3[\s\S]*replay_version\s*=\s*4/i
    );
  }
);

test(
  "V4 migration transforms current RPC authorities instead of rebuilding stale bodies",
  () => {
    const definitions =
      migration.match(
        /pg_get_functiondef/g
      ) || [];

    assert.ok(
      definitions.length >= 8
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
      /cing_block_puzzle_continue_purchases/
    );

    assert.match(
      migration,
      /BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT/
    );

    assert.match(
      migration,
      /BLOCK_PUZZLE_CONTINUE_PURCHASE_MISMATCH/
    );
  }
);

test(
  "V4 continue capability supports replay V3 and V4",
  () => {
    assert.match(
      migration,
      /v_session\.engine_version = 2[\s\S]*v_session\.replay_version = 3[\s\S]*v_session\.engine_version = 3[\s\S]*v_session\.replay_version = 4/i
    );

    assert.match(
      migration,
      /replay_version not in \(3, 4\)/i
    );

    assert.match(
      migration,
      /BLOCK_PUZZLE_CONTINUE_REQUIRES_REPLAY_V3/
    );
  }
);

test(
  "V4 capability preserves backend-only mutation ACL",
  () => {
    for (
      const functionName of [
        "cing_block_puzzle_start_session_atomic",
        "cing_block_puzzle_submit_session_atomic",
        "cing_block_puzzle_purchase_continue_atomic",
        "cing_block_puzzle_submit_session_atomic_v2",
      ]
    ) {
      assert.match(
        migration,
        new RegExp(
          `revoke all[\\s\\S]*${functionName}`,
          "i"
        )
      );

      assert.match(
        migration,
        new RegExp(
          `${functionName}[\\s\\S]*to service_role`,
          "i"
        )
      );
    }
  }
);

test(
  "V4 capability does not activate application issuer",
  () => {
    assert.match(
      issuer,
      /const ENGINE_VERSION = 2;/
    );

    assert.match(
      issuer,
      /const RULES_VERSION = 2;/
    );

    assert.match(
      issuer,
      /const SCORE_VERSION = 2;/
    );

    assert.match(
      issuer,
      /const REPLAY_VERSION = 3;/
    );

    assert.doesNotMatch(
      issuer,
      /const ENGINE_VERSION = 3;/
    );
  }
);

test(
  "V4 migration validates replacement constraint before canonical rename",
  () => {
    assert.match(
      migration,
      /not valid;[\s\S]*validate constraint[\s\S]*drop constraint[\s\S]*rename constraint/i
    );
  }
);
