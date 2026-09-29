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

const dbPath =
  path.join(
    root,
    "db/migrations/20260930_cing_points_revive_credit_point_history_projection_v1.sql"
  );

const sbPath =
  path.join(
    root,
    "supabase/migrations/20260930033000_cing_points_revive_credit_point_history_projection_v1.sql"
  );

const db =
  fs.readFileSync(
    dbPath,
    "utf8"
  );

const sb =
  fs.readFileSync(
    sbPath,
    "utf8"
  );

test(
  "Points Revive history migration mirrors are byte-identical",
  () => {
    assert.equal(
      db,
      sb
    );
  }
);

test(
  "history derives only from canonical point ledger",
  () => {
    assert.match(
      db,
      /from public\.point_transactions pt/i
    );

    assert.match(
      db,
      /metadata ->> 'source'\s*=\s*'points_revive_credit_purchase_v1'/i
    );

    assert.match(
      db,
      /metadata ->> 'purchase_id'/i
    );

    assert.match(
      db,
      /transaction_type = 'deduct'/i
    );

    assert.match(
      db,
      /points < 0/i
    );
  }
);

test(
  "customer projection uses Thẻ hồi sinh wording",
  () => {
    assert.match(
      db,
      /Mua Thẻ hồi sinh bằng điểm tích lũy/
    );

    assert.doesNotMatch(
      db,
      /'reason'\s*,\s*new\.reason/i
    );
  }
);

test(
  "customer history receives points_deducted projection",
  () => {
    assert.match(
      db,
      /public\.analytics_events/i
    );

    assert.match(
      db,
      /'points_deducted'/i
    );

    assert.match(
      db,
      /'amount'[\s\S]*new\.points/i
    );

    assert.match(
      db,
      /'new_total'[\s\S]*new\.balance_after/i
    );

    assert.match(
      db,
      /'purchase_id'[\s\S]*v_purchase_id/i
    );
  }
);

test(
  "projection is exactly-once per purchase",
  () => {
    assert.match(
      db,
      /analytics_events_points_revive_history_uq/i
    );

    assert.match(
      db,
      /'reference_type'[\s\S]*'points_revive_credit_purchase'/i
    );

    assert.match(
      db,
      /'reference_id'[\s\S]*v_purchase_id/i
    );

    assert.match(
      db,
      /on conflict do nothing/i
    );

    assert.match(
      db,
      /POINTS_REVIVE_HISTORY_PROJECTION_DUPLICATE/i
    );
  }
);

test(
  "future point debit is projected by trigger",
  () => {
    assert.match(
      db,
      /create trigger\s+project_points_revive_credit_history_v1/i
    );

    assert.match(
      db,
      /after insert[\s\S]*on public\.point_transactions/i
    );

    assert.match(
      db,
      /execute function\s+public\.project_points_revive_credit_history_v1/i
    );
  }
);

test(
  "historical canonical point ledgers are backfilled",
  () => {
    assert.match(
      db,
      /Historical canonical ledger backfill/i
    );

    assert.match(
      db,
      /pt\.created_at/i
    );

    assert.match(
      db,
      /POINTS_REVIVE_HISTORY_PROJECTION_MISSING/i
    );
  }
);

test(
  "migration never changes financial authority",
  () => {
    assert.doesNotMatch(
      db,
      /\bupdate\s+public\.players\b/i
    );

    assert.doesNotMatch(
      db,
      /\binsert\s+into\s+public\.point_transactions\b/i
    );

    assert.doesNotMatch(
      db,
      /\bupdate\s+public\.point_transactions\b/i
    );

    assert.doesNotMatch(
      db,
      /\bdelete\s+from\s+public\.point_transactions\b/i
    );

    assert.doesNotMatch(
      db,
      /\bupdate\s+public\.cing_revive_credit_transactions\b/i
    );

    assert.doesNotMatch(
      db,
      /\binsert\s+into\s+public\.cing_revive_credit_transactions\b/i
    );

    assert.doesNotMatch(
      db,
      /\bupdate\s+public\.cing_points_revive_credit_purchases\b/i
    );

    assert.doesNotMatch(
      db,
      /\binsert\s+into\s+public\.cing_points_revive_credit_purchases\b/i
    );
  }
);

test(
  "projection fails closed on malformed canonical ledger",
  () => {
    assert.match(
      db,
      /POINTS_REVIVE_HISTORY_REFERENCE_MISSING/i
    );

    assert.match(
      db,
      /POINTS_REVIVE_HISTORY_LEDGER_ARITHMETIC_INVALID/i
    );

    assert.match(
      db,
      /POINTS_REVIVE_HISTORY_CANONICAL_LEDGER_INVALID/i
    );
  }
);

test(
  "trigger function is not executable as public RPC",
  () => {
    for (
      const role
      of [
        "public",
        "anon",
        "authenticated",
        "service_role",
      ]
    ) {
      const pattern =
        new RegExp(
          String.raw`revoke\s+all\s+`
          + String.raw`on\s+function\s+`
          + String.raw`public\.project_points_revive_credit_history_v1\s*\(\s*\)\s+`
          + String.raw`from\s+`
          + role
          + String.raw`\s*;`,
          "i"
        );

      assert.match(
        db,
        pattern
      );
    }
  }
);
