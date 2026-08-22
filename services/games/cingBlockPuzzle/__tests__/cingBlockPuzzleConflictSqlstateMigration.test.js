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
      "../../../../db/migrations/20260822_cing_block_puzzle_submit_conflict_sqlstate_v1.sql"
    ),
    "utf8"
  );

test(
  "replay conflict no longer uses serialization failure SQLSTATE",
  () => {
    assert.match(
      migration,
      /BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT/
    );

    assert.match(
      migration,
      /using errcode = ''P0001'';/
    );
  }
);

test(
  "migration only permits one legacy 40001 occurrence",
  () => {
    assert.match(
      migration,
      /BLOCK_PUZZLE_40001_OCCURRENCE_INVALID/
    );
  }
);

test(
  "migration fails closed on unexpected RPC source",
  () => {
    assert.match(
      migration,
      /BLOCK_PUZZLE_CONFLICT_SQLSTATE_UNEXPECTED/
    );

    assert.match(
      migration,
      /BLOCK_PUZZLE_SUBMIT_RPC_NOT_FOUND/
    );
  }
);

test(
  "submit RPC remains backend-only",
  () => {
    assert.match(
      migration,
      /from anon;/
    );

    assert.match(
      migration,
      /from authenticated;/
    );

    assert.match(
      migration,
      /to service_role;/
    );
  }
);
