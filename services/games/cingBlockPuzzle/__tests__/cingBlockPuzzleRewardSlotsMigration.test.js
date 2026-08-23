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
      "db/migrations/20260823_cing_block_puzzle_reward_slots_v1.sql"
    ),
    "utf8"
  );

test(
  "reward slots migration locks canonical leaderboard config",
  () => {
    assert.match(
      source,
      /from public\.app_configs[\s\S]*where id = 1[\s\S]*for update/i
    );
  }
);

test(
  "Block Puzzle provisions exactly three admin-editable reward slots",
  () => {
    assert.match(
      source,
      /'rank',\s*1[\s\S]*'points',\s*0/i
    );

    assert.match(
      source,
      /'rank',\s*2[\s\S]*'points',\s*0/i
    );

    assert.match(
      source,
      /'rank',\s*3[\s\S]*'points',\s*0/i
    );
  }
);

test(
  "migration preserves any non-empty admin reward configuration",
  () => {
    assert.match(
      source,
      /jsonb_array_length\(v_rewards\)\s*=\s*0/i
    );

    assert.doesNotMatch(
      source,
      /'points',\s*(?:20|30|40|50|60|80|100|200|300|500)/i
    );
  }
);

test(
  "migration does not mutate Block Puzzle enabled or weekly reset policy",
  () => {
    assert.doesNotMatch(
      source,
      /jsonb_set\(\s*v_entry,\s*'\{enabled\}'/i
    );

    assert.doesNotMatch(
      source,
      /jsonb_set\(\s*v_entry,\s*'\{weekly_reset\}'/i
    );
  }
);

test(
  "malformed rewards configuration fails closed",
  () => {
    assert.match(
      source,
      /REWARDS_CONFIG_INVALID/
    );
  }
);
