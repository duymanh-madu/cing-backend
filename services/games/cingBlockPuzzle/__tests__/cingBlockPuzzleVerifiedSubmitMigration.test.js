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
      __dirname,
      "../../../../db/migrations/20260822_cing_block_puzzle_verified_score_submit_v1.sql"
    ),
    "utf8"
  );

test(
  "adds durable score to gameplay-session binding",
  () => {
    assert.match(
      migration,
      /add column if not exists block_puzzle_session_id uuid/i
    );

    assert.match(
      migration,
      /foreign key\s*\(block_puzzle_session_id\)[\s\S]*references\s+public\.cing_block_puzzle_sessions\s*\(id\)/i
    );
  }
);

test(
  "Block Puzzle score requires session identity",
  () => {
    assert.match(
      migration,
      /game_key = 'cing-block-puzzle'[\s\S]*and block_puzzle_session_id is not null[\s\S]*game_key <> 'cing-block-puzzle'[\s\S]*and block_puzzle_session_id is null/i
    );
  }
);

test(
  "non Block Puzzle scores cannot claim Block Puzzle session identity",
  () => {
    assert.match(
      migration,
      /game_key <> 'cing-block-puzzle'[\s\S]*and block_puzzle_session_id is null/i
    );
  }
);

test(
  "shared game_scores namespace is not claimed by a generic session_id column",
  () => {
    assert.doesNotMatch(
      migration,
      /add column if not exists session_id uuid/i
    );

    assert.match(
      migration,
      /add column if not exists block_puzzle_session_id uuid/i
    );
  }
);

test(
  "one Block Puzzle session can persist at most one score",
  () => {
    assert.match(
      migration,
      /create unique index if not exists\s+game_scores_block_puzzle_session_uq[\s\S]*on public\.game_scores\s*\(block_puzzle_session_id\)[\s\S]*game_key = 'cing-block-puzzle'/i
    );
  }
);

test(
  "legacy client roles lose game score mutation privileges",
  () => {
    assert.match(
      migration,
      /revoke insert, update, delete, truncate, references, trigger[\s\S]*from anon;/i
    );

    assert.match(
      migration,
      /revoke insert, update, delete, truncate, references, trigger[\s\S]*from authenticated;/i
    );
  }
);

test(
  "submit authority locks gameplay session",
  () => {
    assert.match(
      migration,
      /from public\.cing_block_puzzle_sessions[\s\S]*where id = p_session_id[\s\S]*for update;/i
    );
  }
);

test(
  "submit authority validates ownership and versions",
  () => {
    assert.match(
      migration,
      /v_session\.user_id <> p_user_id/i
    );

    assert.match(
      migration,
      /v_session\.engine_version <> 1[\s\S]*v_session\.rules_version <> 1[\s\S]*v_session\.score_version <> 1[\s\S]*v_session\.replay_version <> 1/i
    );
  }
);

test(
  "same submitted replay is idempotent",
  () => {
    assert.match(
      migration,
      /if v_session\.status = 'submitted'/i
    );

    assert.match(
      migration,
      /'idempotent',[\s\S]*true/i
    );
  }
);

test(
  "different replay on submitted session fails closed",
  () => {
    assert.match(
      migration,
      /BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT/i
    );
  }
);

test(
  "verified score is persisted before terminal session update",
  () => {
    const scoreInsert =
      migration.indexOf(
        "insert into public.game_scores"
      );

    const sessionUpdate =
      migration.indexOf(
        "update public.cing_block_puzzle_sessions"
      );

    assert.ok(
      scoreInsert >= 0
    );

    assert.ok(
      sessionUpdate > scoreInsert
    );
  }
);

test(
  "score id is database generated",
  () => {
    const insertStart =
      migration.indexOf(
        "insert into public.game_scores"
      );

    const valuesStart =
      migration.indexOf(
        "values (",
        insertStart
      );

    const columns =
      migration.slice(
        insertStart,
        valuesStart
      );

    assert.doesNotMatch(
      columns,
      /\bid\s*,/i
    );
  }
);

test(
  "score metadata declares server replay authority",
  () => {
    assert.match(
      migration,
      /'authority',[\s\S]*'server_replay_v1'/i
    );

    assert.match(
      migration,
      /'replay_fingerprint'/i
    );
  }
);

test(
  "submit RPC is security definer",
  () => {
    assert.match(
      migration,
      /cing_block_puzzle_submit_session_atomic[\s\S]*security definer[\s\S]*set search_path = public/i
    );
  }
);

test(
  "client roles cannot execute verified submit RPC",
  () => {
    assert.match(
      migration,
      /cing_block_puzzle_submit_session_atomic[\s\S]*from anon;/i
    );

    assert.match(
      migration,
      /cing_block_puzzle_submit_session_atomic[\s\S]*from authenticated;/i
    );
  }
);

test(
  "service role alone receives submit execution authority",
  () => {
    assert.match(
      migration,
      /grant execute[\s\S]*cing_block_puzzle_submit_session_atomic[\s\S]*to service_role;/i
    );
  }
);
