const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const source =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20260822_cing_block_puzzle_leaderboard_admin_config_v1.sql"
    ),
    "utf8"
  );

test(
  "leaderboard admin provisioning targets app_configs id 1",
  () => {
    assert.match(
      source,
      /from public\.app_configs[\s\S]*where id = 1[\s\S]*for update/i
    );

    assert.match(
      source,
      /update public\.app_configs[\s\S]*where id = 1/i
    );
  }
);

test(
  "Block Puzzle leaderboard entry is provisioned disabled without invented rewards",
  () => {
    assert.match(
      source,
      /cing-block-puzzle/
    );

    assert.match(
      source,
      /'enabled', false/
    );

    assert.match(
      source,
      /'weekly_reset', true/
    );

    assert.match(
      source,
      /'rewards', '\[\]'::jsonb/
    );
  }
);

test(
  "existing production Block Puzzle configuration wins over defaults",
  () => {
    assert.match(
      source,
      /v_entry\s*:=\s*v_entry\s*\|\|\s*v_existing/
    );
  }
);

test(
  "migration fails closed on malformed leaderboard configuration",
  () => {
    assert.match(
      source,
      /LEADERBOARD_CONFIG_INVALID/
    );

    assert.match(
      source,
      /LEADERBOARD_GAMES_INVALID/
    );

    assert.match(
      source,
      /LEADERBOARD_ENTRY_CONFLICT/
    );
  }
);
