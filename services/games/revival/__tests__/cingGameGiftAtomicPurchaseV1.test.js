"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const root =
  path.resolve(
    __dirname,
    "../../../.."
  );

const name =
  "20260926_cing_game_gift_atomic_purchase_v1.sql";

const sql =
  fs.readFileSync(
    path.join(
      root,
      "db/migrations",
      name
    ),
    "utf8"
  );

const mirror =
  fs.readFileSync(
    path.join(
      root,
      "supabase/migrations",
      "20260926013000_cing_game_gift_atomic_purchase_v1.sql"
    ),
    "utf8"
  );

const executable =
  sql.replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  ).replace(
    /--[^\n]*/g,
    ""
  );

test(
  "exact Supabase mirror",
  () => {
    assert.equal(
      sql,
      mirror
    );
  }
);

test(
  "one shared core and two funding-specific RPCs",
  () => {
    assert.match(
      executable,
      /create function\s+public\.cing_game_gift_purchase_private_v1/i
    );

    assert.match(
      executable,
      /create function\s+public\.cing_game_gift_purchase_wallet_v1/i
    );

    assert.match(
      executable,
      /create function\s+public\.cing_game_gift_purchase_points_v1/i
    );
  }
);

test(
  "caller cannot inject funding source into public RPCs",
  () => {
    assert.match(
      executable,
      /p_request_id,\s*'wallet'/i
    );

    assert.match(
      executable,
      /p_request_id,\s*'points'/i
    );
  }
);

test(
  "players locked in stable order",
  () => {
    assert.match(
      executable,
      /order by p\.user_id\s+for update/i
    );
  }
);

test(
  "historical request checked before current catalog",
  () => {
    const replay =
      executable.indexOf(
        "from public.cing_game_gift_purchases g"
      );

    const catalog =
      executable.indexOf(
        "from public.cing_game_gift_catalog c"
      );

    assert.ok(
      replay >= 0
    );

    assert.ok(
      catalog > replay
    );
  }
);

test(
  "Wallet mutation has durable gift reference",
  () => {
    assert.match(
      executable,
      /cing_wallet_apply_mutation_private\s*\(/i
    );

    assert.match(
      executable,
      /'game_gift_purchase'/i
    );

    assert.match(
      executable,
      /'gift_purchase_id',\s*p_request_id/i
    );
  }
);

test(
  "point debit has permanent loyalty ledger",
  () => {
    assert.match(
      executable,
      /update public\.players\s+set total_points/i
    );

    assert.match(
      executable,
      /insert into\s+public\.point_transactions/i
    );

    assert.match(
      executable,
      /'cing_game_gift_purchase_v1'/i
    );
  }
);

test(
  "recipient Charm is awarded inside financial RPC",
  () => {
    assert.match(
      executable,
      /update public\.players\s+set charm_points/i
    );

    assert.match(
      executable,
      /insert into\s+public\.cing_game_gift_purchases/i
    );
  }
);

test(
  "gift notification is durable and non-duplicating on replay",
  () => {
    assert.match(
      executable,
      /insert into public\.notifications/i
    );

    const replay =
      executable.indexOf(
        "if found then"
      );

    const notification =
      executable.indexOf(
        "insert into public.notifications"
      );

    assert.ok(
      replay >= 0
    );

    assert.ok(
      notification > replay
    );
  }
);

test(
  "exact VND to Points conversion",
  () => {
    assert.match(
      executable,
      /mod\(\s*v_catalog\.price_vnd,\s*1000\s*\)\s*<>\s*0/i
    );

    assert.match(
      executable,
      /v_catalog\.price_vnd\s*\/\s*1000/i
    );
  }
);

test(
  "point-funded gift carries iPOS obligation",
  () => {
    assert.match(
      executable,
      /then 'pending'/i
    );

    assert.match(
      executable,
      /else 'not_required'/i
    );
  }
);

test(
  "all three functions remain dormant",
  () => {
    assert.doesNotMatch(
      executable,
      /\bgrant execute\b/i
    );

    assert.equal(
      (
        executable.match(
          /revoke all/g
        ) || []
      ).length,
      3
    );
  }
);

test(
  "no existing Chess or Wallet RPC replacement",
  () => {
    assert.doesNotMatch(
      executable,
      /create or replace function\s+public\.cing_wallet_purchase_revive_credits_v1/i
    );

    assert.doesNotMatch(
      executable,
      /create or replace function\s+public\.cing_block_puzzle_purchase_continue_atomic/i
    );
  }
);

test(
  "migration does not execute purchases",
  () => {
    assert.match(
      executable,
      /^\s*begin\s*;/i
    );

    assert.match(
      executable,
      /commit\s*;\s*$/i
    );

    assert.doesNotMatch(
      executable,
      /select\s+public\.cing_game_gift_purchase_wallet_v1\s*\(/i
    );
  }
);
