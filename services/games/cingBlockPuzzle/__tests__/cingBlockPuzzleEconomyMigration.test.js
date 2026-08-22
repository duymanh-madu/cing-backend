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
      "../../../../db/migrations/20260822_cing_block_puzzle_economy_policy_v1.sql"
    ),
    "utf8"
  );

test(
  "economy provisioning targets app_configs id 1",
  () => {
    assert.match(
      migration,
      /from public\.app_configs[\s\S]*where id = 1[\s\S]*for update;/i
    );
  }
);

test(
  "economy provisioning is paid offline",
  () => {
    assert.match(
      migration,
      /'economy_type'[\s\S]*'paid_offline'/i
    );
  }
);

test(
  "economy provisioning only adds cing block puzzle game entry",
  () => {
    assert.match(
      migration,
      /jsonb_set\([\s\S]*v_games[\s\S]*'\{cing-block-puzzle\}'/i
    );

    assert.match(
      migration,
      /jsonb_set\([\s\S]*v_config[\s\S]*'\{games\}'/i
    );
  }
);

test(
  "existing conflicting policy fails closed",
  () => {
    assert.match(
      migration,
      /CING_BLOCK_PUZZLE_ECONOMY_POLICY_CONFLICT/i
    );
  }
);

test(
  "re-running intended paid offline policy is idempotent",
  () => {
    assert.match(
      migration,
      /if v_existing is not null then[\s\S]*paid_offline[\s\S]*return;/i
    );
  }
);
