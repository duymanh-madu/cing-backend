const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const migration =
  fs.readFileSync(
    "db/migrations/20260823_cing_block_puzzle_continue_history_projection_v1.sql",
    "utf8"
  );

test(
  "Continue history projection is atomic with authoritative purchase",
  () => {
    assert.match(
      migration,
      /insert into\s+public\.point_transactions[\s\S]*insert into\s+public\.analytics_events[\s\S]*update\s+public\.cing_block_puzzle_sessions/i
    );

    assert.match(
      migration,
      /'points_deducted'/
    );

    assert.match(
      migration,
      /'new_total',\s*v_balance_after/
    );
  }
);

test(
  "point_transactions remains the authoritative source for backfill",
  () => {
    assert.match(
      migration,
      /from public\.point_transactions pt/i
    );

    assert.match(
      migration,
      /pt\.metadata->>'source'\s*=\s*'cing_block_puzzle_continue'/i
    );
  }
);

test(
  "Continue history projection is idempotent by purchase id",
  () => {
    assert.match(
      migration,
      /analytics_events_cing_bp_continue_purchase_uidx/
    );

    assert.match(
      migration,
      /event_data->>'purchase_id'/
    );

    assert.match(
      migration,
      /not exists[\s\S]*purchase_id/i
    );
  }
);

test(
  "Continue purchase RPC remains backend only",
  () => {
    assert.match(
      migration,
      /revoke all[\s\S]*from anon/i
    );

    assert.match(
      migration,
      /revoke all[\s\S]*from authenticated/i
    );

    assert.match(
      migration,
      /grant execute[\s\S]*to service_role/i
    );
  }
);
