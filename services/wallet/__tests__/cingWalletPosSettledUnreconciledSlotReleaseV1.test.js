const fs = require("node:fs");
const assert = require("node:assert/strict");
const test = require("node:test");

const dbFile =
  "db/migrations/20260915_cing_wallet_pos_settled_unreconciled_slot_release_v1.sql";

const supabaseFile =
  "supabase/migrations/20260915163000_cing_wallet_pos_settled_unreconciled_slot_release_v1.sql";

const sql =
  fs.readFileSync(
    supabaseFile,
    "utf8"
  );

test(
  "migration mirrors are byte-identical",
  () => {
    assert.equal(
      fs.readFileSync(
        dbFile,
        "utf8"
      ),
      sql
    );
  }
);

test(
  "active payment index protects only unfinished payment states",
  () => {
    const match =
      sql.match(
        /create\s+unique\s+index\s+cing_wallet_pos_sessions_active_payment_pos_uq[\s\S]*?where([\s\S]*?);/i
      );

    assert.ok(match);

    const predicate =
      match[1];

    assert.match(
      predicate,
      /'amount_frozen'/
    );

    assert.match(
      predicate,
      /'qr_ready'/
    );

    assert.doesNotMatch(
      predicate,
      /'reconciliation_pending'/
    );

    assert.doesNotMatch(
      predicate,
      /'paid'/
    );
  }
);

test(
  "manual create busy predicate releases settled reconciliation backlog",
  () => {
    const start =
      sql.indexOf(
        "create or replace function\npublic.cing_wallet_create_manual_pos_session_v2"
      );

    assert.ok(start >= 0);

    const end =
      sql.indexOf(
        "$$;",
        start
      );

    assert.ok(end > start);

    const block =
      sql.slice(
        start,
        end
      );

    const busyStart =
      block.indexOf(
        "into v_busy"
      );

    assert.ok(
      busyStart >= 0
    );

    const busyEnd =
      block.indexOf(
        "if found then",
        busyStart
      );

    assert.ok(
      busyEnd > busyStart
    );

    const busyBlock =
      block.slice(
        busyStart,
        busyEnd
      );

    assert.match(
      busyBlock,
      /'amount_frozen'/
    );

    assert.match(
      busyBlock,
      /'qr_ready'/
    );

    assert.doesNotMatch(
      busyBlock,
      /'reconciliation_pending'/
    );

    assert.doesNotMatch(
      busyBlock,
      /'paid'/
    );
  }
);

test(
  "current cashier session excludes historical settled reconciliation backlog",
  () => {
    const start =
      sql.indexOf(
        "create or replace function\npublic.cing_wallet_get_current_manual_pos_session_v1"
      );

    assert.ok(start >= 0);

    const end =
      sql.indexOf(
        "$$;",
        start
      );

    assert.ok(end > start);

    const block =
      sql.slice(
        start,
        end
      );

    assert.match(
      block,
      /ps\.status\s+in\s*\(\s*'amount_frozen',\s*'qr_ready'\s*\)/i
    );

    assert.doesNotMatch(
      block,
      /ps\.status\s+in[\s\S]*'reconciliation_pending'/
    );
  }
);

test(
  "migration never fabricates sale transaction identity",
  () => {
    assert.doesNotMatch(
      sql,
      /sale_tran_id\s*=\s*(?!null\b)/i
    );
  }
);

test(
  "migration contains no Wallet or economy mutation authority",
  () => {
    assert.doesNotMatch(
      sql,
      /cing_wallet_apply_mutation_private/i
    );

    assert.doesNotMatch(
      sql,
      /update\s+public\.players/i
    );

    assert.doesNotMatch(
      sql,
      /pending_rewards/i
    );

    assert.doesNotMatch(
      sql,
      /updateMemberPoint/i
    );

    assert.doesNotMatch(
      sql,
      /claim_pending_reward/i
    );
  }
);

test(
  "migration does not redefine Event11 reconciliation authority",
  () => {
    assert.doesNotMatch(
      sql,
      /create\s+or\s+replace\s+function[\s\r\n]+public\.cing_wallet_reconcile_pos_event11_v2/i
    );
  }
);
