const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const path =
  require("path");

const migrationPath =
  path.join(
    __dirname,
    "../../../../db/migrations/20260822_cing_block_puzzle_paid_session_foundation_v1.sql"
  );

const migration =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

test(
  "migration revokes direct table access from public client roles",
  () => {
    assert.match(
      migration,
      /revoke all\s+on table public\.cing_block_puzzle_sessions\s+from public;/i
    );

    assert.match(
      migration,
      /revoke all\s+on table public\.cing_block_puzzle_sessions\s+from anon;/i
    );

    assert.match(
      migration,
      /revoke all\s+on table public\.cing_block_puzzle_sessions\s+from authenticated;/i
    );
  }
);

test(
  "session start function is security definer with fixed search path",
  () => {
    assert.match(
      migration,
      /security definer/i
    );

    assert.match(
      migration,
      /set search_path = public/i
    );
  }
);

test(
  "only service_role receives start-session execute authority",
  () => {
    assert.match(
      migration,
      /grant execute[\s\S]*to service_role;/i
    );

    assert.match(
      migration,
      /revoke all[\s\S]*from anon;/i
    );

    assert.match(
      migration,
      /revoke all[\s\S]*from authenticated;/i
    );
  }
);

test(
  "session uniqueness binds authenticated user and request id",
  () => {
    assert.match(
      migration,
      /unique\s*\(\s*user_id\s*,\s*request_id\s*\)/i
    );
  }
);

test(
  "session creation locks player before consuming play",
  () => {
    const lockIndex =
      migration.indexOf(
        "for update;"
      );

    const decrementIndex =
      migration.indexOf(
        "set game_plays = coalesce(game_plays, 0) - 1"
      );

    assert.ok(
      lockIndex >= 0
    );

    assert.ok(
      decrementIndex > lockIndex
    );
  }
);

test(
  "concurrent retry is rechecked after player lock and before play consumption",
  () => {
    const lockIndex =
      migration.indexOf(
        "for update;"
      );

    const recheckCommentIndex =
      migration.indexOf(
        "Critical concurrent-idempotency fence"
      );

    const decrementIndex =
      migration.indexOf(
        "set game_plays = coalesce(game_plays, 0) - 1"
      );

    assert.ok(
      lockIndex >= 0
    );

    assert.ok(
      recheckCommentIndex > lockIndex
    );

    assert.ok(
      decrementIndex > recheckCommentIndex
    );

    const postLockSection =
      migration.slice(
        lockIndex,
        decrementIndex
      );

    assert.match(
      postLockSection,
      /from public\.cing_block_puzzle_sessions[\s\S]*where user_id = p_user_id[\s\S]*and request_id = p_request_id[\s\S]*if found then[\s\S]*return v_existing;/i
    );
  }
);

test(
  "unexpected insert failure is not swallowed by unique violation handler",
  () => {
    assert.doesNotMatch(
      migration,
      /when unique_violation then/i
    );
  }
);

test(
  "economy must be configured as paid offline",
  () => {
    assert.match(
      migration,
      /v_economy_type <> 'paid_offline'/i
    );
  }
);

test(
  "play consumption is exactly one",
  () => {
    assert.match(
      migration,
      /game_plays = coalesce\(game_plays, 0\) - 1/i
    );

    assert.match(
      migration,
      /check \(play_cost = 1\)/i
    );
  }
);
