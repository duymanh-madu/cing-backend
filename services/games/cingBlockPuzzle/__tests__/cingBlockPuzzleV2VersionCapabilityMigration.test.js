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
      "db/migrations/20260823_cing_block_puzzle_v2_version_capability.sql"
    ),
    "utf8"
  );

test(
  "V2 capability migration permits only exact V1 and V2 tuples",
  () => {
    assert.match(
      migration,
      /engine_version\s*=\s*1[\s\S]*rules_version\s*=\s*1[\s\S]*score_version\s*=\s*1[\s\S]*replay_version\s*=\s*1/i
    );

    assert.match(
      migration,
      /engine_version\s*=\s*2[\s\S]*rules_version\s*=\s*2[\s\S]*score_version\s*=\s*2[\s\S]*replay_version\s*=\s*2/i
    );
  }
);

test(
  "migration transforms latest RPC definitions instead of reconstructing stale bodies",
  () => {
    assert.match(
      migration,
      /pg_get_functiondef/i
    );

    assert.match(
      migration,
      /to_regprocedure/i
    );

    assert.doesNotMatch(
      migration,
      /create\s+or\s+replace\s+function\s+public\.cing_block_puzzle_start_session_atomic/i
    );

    assert.doesNotMatch(
      migration,
      /create\s+or\s+replace\s+function\s+public\.cing_block_puzzle_submit_session_atomic/i
    );
  }
);

test(
  "start migration requires current ledger and analytics authority",
  () => {
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
      /v_balance_before/
    );

    assert.match(
      migration,
      /v_balance_after/
    );

    assert.match(
      migration,
      /for update/i
    );
  }
);

test(
  "start session persists validated version parameters rather than V1 literals",
  () => {
    assert.match(
      migration,
      /p_engine_version,[\s\S]*p_rules_version,[\s\S]*p_score_version,[\s\S]*p_replay_version/
    );
  }
);

test(
  "submit migration requires hardened replay conflict semantics",
  () => {
    assert.match(
      migration,
      /BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT/
    );

    assert.match(
      migration,
      /using errcode = ''P0001'';/
    );

    assert.doesNotMatch(
      migration,
      /using errcode = ''40001'';/
    );
  }
);

test(
  "server replay authority metadata follows replay version",
  () => {
    assert.match(
      migration,
      /server_replay_v%s/
    );

    assert.match(
      migration,
      /v_session\.replay_version/
    );
  }
);

test(
  "V2 migration preserves backend-only RPC ACL",
  () => {
    assert.match(
      migration,
      /from public/
    );

    assert.match(
      migration,
      /from anon/
    );

    assert.match(
      migration,
      /from authenticated/
    );

    assert.match(
      migration,
      /to service_role/
    );
  }
);

test(
  "migration is one atomic transaction",
  () => {
    assert.match(
      migration,
      /^\s*begin;/i
    );

    assert.match(
      migration,
      /commit;\s*$/i
    );
  }
);
