const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const path =
  require("path");

const sql =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20260823_cing_block_puzzle_continue_purchase_authority_v1.sql"
    ),
    "utf8"
  );

test(
  "continue authority has exact 5 10 20 server-side pricing",
  () => {
    assert.match(
      sql,
      /when 1 then 5/i
    );

    assert.match(
      sql,
      /when 2 then 10/i
    );

    assert.match(
      sql,
      /when 3 then 20/i
    );

    assert.match(
      sql,
      /continue_count <= 3/i
    );
  }
);

test(
  "continue authority serializes session before player balance",
  () => {
    const sessionLock =
      sql.search(
        /from public\.cing_block_puzzle_sessions[\s\S]*for update;/i
      );

    const playerLock =
      sql.search(
        /from public\.players[\s\S]*for update;/i
      );

    assert.ok(
      sessionLock >= 0
    );

    assert.ok(
      playerLock >
        sessionLock
    );
  }
);

test(
  "continue authority is replay V3 only",
  () => {
    assert.match(
      sql,
      /engine_version = 2[\s\S]*rules_version = 2[\s\S]*score_version = 2[\s\S]*replay_version = 3/i
    );

    assert.match(
      sql,
      /BLOCK_PUZZLE_CONTINUE_REQUIRES_REPLAY_V3/
    );
  }
);

test(
  "purchase retry is idempotent by user and request id",
  () => {
    assert.match(
      sql,
      /unique\s*\(\s*user_id\s*,\s*request_id\s*\)/i
    );

    assert.match(
      sql,
      /where user_id = p_user_id[\s\S]*and request_id = p_request_id/i
    );

    assert.match(
      sql,
      /'idempotent',[\s\S]*true/i
    );
  }
);

test(
  "one continue ordinal can be purchased at most once per session",
  () => {
    assert.match(
      sql,
      /unique\s*\(\s*session_id\s*,\s*continue_index\s*\)/i
    );
  }
);

test(
  "point debit ledger and continue state commit in same RPC",
  () => {
    assert.match(
      sql,
      /update public\.players[\s\S]*set total_points/i
    );

    assert.match(
      sql,
      /insert into[\s\S]*public\.cing_block_puzzle_continue_purchases/i
    );

    assert.match(
      sql,
      /insert into[\s\S]*public\.point_transactions/i
    );

    assert.match(
      sql,
      /update[\s\S]*public\.cing_block_puzzle_sessions[\s\S]*set continue_count/i
    );
  }
);

test(
  "continue mutation authority is private",
  () => {
    for (
      const role of [
        "public",
        "anon",
        "authenticated",
      ]
    ) {
      assert.match(
        sql,
        new RegExp(
          `revoke all[\\s\\S]*cing_block_puzzle_purchase_continue_atomic[\\s\\S]*from ${role}`,
          "i"
        )
      );
    }

    assert.match(
      sql,
      /grant execute[\s\S]*cing_block_puzzle_purchase_continue_atomic[\s\S]*to service_role/i
    );
  }
);

test(
  "continue ledger itself is not directly mutable by service role",
  () => {
    assert.match(
      sql,
      /revoke all[\s\S]*on table[\s\S]*cing_block_puzzle_continue_purchases[\s\S]*from service_role/i
    );

    assert.match(
      sql,
      /grant select[\s\S]*cing_block_puzzle_continue_purchases[\s\S]*to service_role/i
    );
  }
);
