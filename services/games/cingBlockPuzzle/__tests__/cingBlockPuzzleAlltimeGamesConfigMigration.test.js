const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync(
  "db/migrations/20260823_cing_block_puzzle_alltime_games_config_v1.sql",
  "utf8"
);

test(
  "Block Puzzle is provisioned into alltime games config",
  () => {
    assert.match(
      migration,
      /cing-block-puzzle/
    );

    assert.match(
      migration,
      /Cing Block Puzzle/
    );

    assert.match(
      migration,
      /\/game-icons\/cing-block-puzzle\.png/
    );
  }
);

test(
  "existing Block Puzzle alltime admin config wins over defaults",
  () => {
    assert.match(
      migration,
      /v_block_puzzle\s*:=\s*v_block_puzzle\s*\|\|\s*v_existing/
    );
  }
);

test(
  "migration locks canonical app config before merge",
  () => {
    assert.match(
      migration,
      /where id = 1[\s\S]*for update/i
    );
  }
);

test(
  "migration fails closed on malformed games config",
  () => {
    assert.match(
      migration,
      /jsonb_typeof\(v_games\)\s*<>\s*'object'/
    );
  }
);
