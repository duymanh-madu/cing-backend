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
      "../../../../db/migrations/20260822_cing_block_puzzle_session_table_acl_hardening_v1.sql"
    ),
    "utf8"
  );

test(
  "hardening revokes inherited service role table privileges first",
  () => {
    assert.match(
      migration,
      /revoke all\s+on table public\.cing_block_puzzle_sessions\s+from service_role;/i
    );
  }
);

test(
  "service role receives only repository-required privileges",
  () => {
    assert.match(
      migration,
      /grant select,\s*insert,\s*update\s+on table public\.cing_block_puzzle_sessions\s+to service_role;/i
    );

    assert.doesNotMatch(
      migration,
      /grant[\s\S]*delete[\s\S]*to service_role/i
    );

    assert.doesNotMatch(
      migration,
      /grant[\s\S]*truncate[\s\S]*to service_role/i
    );
  }
);

test(
  "client roles remain fully revoked",
  () => {
    for (
      const role of
      ["public", "anon", "authenticated"]
    ) {
      const pattern =
        new RegExp(
          `revoke all\\s+on table public\\.cing_block_puzzle_sessions\\s+from ${role};`,
          "i"
        );

      assert.match(
        migration,
        pattern
      );
    }
  }
);
