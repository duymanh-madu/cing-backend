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
      "db/migrations/20260825_cing_block_puzzle_continue_v4_predicate_fix.sql"
    ),
    "utf8"
  );

test(
  "Continue V4 fix groups Replay V3 and V4 inside one negation",
  () => {
    assert.match(
      migration,
      /if not \(\s*\(\s*v_session\.engine_version = 2[\s\S]*v_session\.replay_version = 3\s*\)\s*or\s*\(\s*v_session\.engine_version = 3[\s\S]*v_session\.replay_version = 4\s*\)\s*\) then/i
    );
  }
);

test(
  "Continue V4 fix explicitly rejects malformed NOT V3 OR V4 precedence",
  () => {
    assert.match(
      migration,
      /BLOCK_PUZZLE_CONTINUE_V4_FIX_BAD_PRECEDENCE_STILL_PRESENT/
    );

    assert.match(
      migration,
      /v_bad_count <> 0/
    );
  }
);

test(
  "Continue V4 fix transforms current authority instead of rebuilding stale RPC",
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
      /cing_block_puzzle_continue_purchases/
    );

    assert.match(
      migration,
      /point_transactions/
    );

    assert.match(
      migration,
      /analytics_events/
    );
  }
);

test(
  "Continue V4 fix preserves backend-only purchase authority",
  () => {
    assert.match(
      migration,
      /revoke all[\s\S]*cing_block_puzzle_purchase_continue_atomic[\s\S]*from public, anon, authenticated/i
    );

    assert.match(
      migration,
      /grant execute[\s\S]*cing_block_puzzle_purchase_continue_atomic[\s\S]*to service_role/i
    );
  }
);

test(
  "correct grouped predicate accepts both V3 and V4 only",
  () => {
    const permitted = ({
      engine,
      rules,
      score,
      replay,
    }) => {
      const v3 =
        engine === 2 &&
        rules === 2 &&
        score === 2 &&
        replay === 3;

      const v4 =
        engine === 3 &&
        rules === 3 &&
        score === 3 &&
        replay === 4;

      return !(
        !(
          v3 ||
          v4
        )
      );
    };

    assert.equal(
      permitted({
        engine: 2,
        rules: 2,
        score: 2,
        replay: 3,
      }),
      true
    );

    assert.equal(
      permitted({
        engine: 3,
        rules: 3,
        score: 3,
        replay: 4,
      }),
      true
    );

    assert.equal(
      permitted({
        engine: 2,
        rules: 2,
        score: 2,
        replay: 2,
      }),
      false
    );

    assert.equal(
      permitted({
        engine: 3,
        rules: 3,
        score: 2,
        replay: 4,
      }),
      false
    );
  }
);
