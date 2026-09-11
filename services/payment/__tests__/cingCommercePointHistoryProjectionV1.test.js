"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const migration =
  fs.readFileSync(
    "db/migrations/20260911_commerce_point_history_projection_v1.sql",
    "utf8"
  );


test(
  "Commerce history projects only from authoritative point ledger",
  () => {
    assert.match(
      migration,
      /after insert[\s\S]*on public\.point_transactions/i
    );

    assert.match(
      migration,
      /new\.commerce_order_id is not null/i
    );
  }
);


test(
  "Commerce deduct ledger projects points_deducted",
  () => {
    assert.match(
      migration,
      /transaction_type = 'deduct'[\s\S]*'points_deducted'/i
    );

    assert.match(
      migration,
      /'amount'[\s\S]*new\.points/i
    );

    assert.match(
      migration,
      /'new_total'[\s\S]*new\.balance_after/i
    );

    assert.match(
      migration,
      /'balance_before'[\s\S]*new\.balance_before/i
    );
  }
);


test(
  "Commerce earn ledger projects points_added",
  () => {
    assert.match(
      migration,
      /transaction_type = 'add'[\s\S]*'points_added'/i
    );

    assert.match(
      migration,
      /new\.points <= 0/i
    );
  }
);


test(
  "projection identity is exact by event type and Commerce order",
  () => {
    assert.match(
      migration,
      /analytics_events_commerce_point_projection_uq/i
    );

    assert.match(
      migration,
      /event_name[\s\S]*metadata ->> 'reference_type'[\s\S]*metadata ->> 'reference_id'/i
    );

    assert.match(
      migration,
      /'commerce_order_points'/i
    );
  }
);


test(
  "projection retains canonical ledger identity",
  () => {
    assert.match(
      migration,
      /'point_transaction_id'[\s\S]*new\.id/i
    );

    assert.match(
      migration,
      /'order_id'[\s\S]*new\.commerce_order_id/i
    );

    assert.match(
      migration,
      /v_order_code\s*:=[\s\S]*new\.metadata ->> 'order_code'/i
    );

    assert.match(
      migration,
      /'order_code'[\s\S]*v_order_code/i
    );
  }
);


test(
  "historical backfill derives only from point_transactions",
  () => {
    const start =
      migration.indexOf(
        "Historical canonical Commerce point-ledger backfill"
      );

    assert.ok(start >= 0);

    const region =
      migration.slice(start);

    assert.match(
      region,
      /from public\.point_transactions pt/i
    );

    assert.match(
      region,
      /insert into[\s\S]*public\.analytics_events/i
    );

    assert.doesNotMatch(
      region,
      /update\s+public\.players/i
    );

    assert.doesNotMatch(
      region,
      /insert into\s+public\.point_transactions/i
    );
  }
);


test(
  "backfill preserves ledger timestamp",
  () => {
    assert.match(
      migration,
      /pt\.created_at[\s\S]*from public\.point_transactions pt/i
    );
  }
);


test(
  "projection cannot mutate financial authority",
  () => {
    assert.doesNotMatch(
      migration,
      /update\s+public\.players/i
    );

    assert.doesNotMatch(
      migration,
      /update\s+public\.payment_transactions/i
    );

    assert.doesNotMatch(
      migration,
      /update\s+public\.orders/i
    );

    assert.doesNotMatch(
      migration,
      /update\s+public\.point_transactions/i
    );
  }
);


test(
  "trigger projection failure remains atomic with ledger insert",
  () => {
    assert.match(
      migration,
      /create trigger[\s\S]*after insert[\s\S]*execute function/i
    );

    assert.doesNotMatch(
      migration,
      /exception[\s\S]*when others[\s\S]*null/i
    );
  }
);


test(
  "projection function is security definer with fixed search path",
  () => {
    assert.match(
      migration,
      /project_commerce_point_history_v1\(\)[\s\S]*security definer[\s\S]*set search_path = public/i
    );
  }
);


test(
  "projection function is not executable by client roles",
  () => {
    assert.match(
      migration,
      /revoke all on function[\s\S]*project_commerce_point_history_v1\(\)[\s\S]*from public/i
    );

    assert.match(
      migration,
      /revoke all on function[\s\S]*project_commerce_point_history_v1\(\)[\s\S]*from anon/i
    );

    assert.match(
      migration,
      /revoke all on function[\s\S]*project_commerce_point_history_v1\(\)[\s\S]*from authenticated/i
    );
  }
);


test(
  "migration verifies complete and exactly-once backfill",
  () => {
    assert.match(
      migration,
      /COMMERCE_POINT_HISTORY_BACKFILL_INCOMPLETE/
    );

    assert.match(
      migration,
      /COMMERCE_POINT_HISTORY_DUPLICATE/
    );
  }
);


test(
  "migration is one PostgreSQL transaction",
  () => {
    assert.equal(
      (
        migration.match(
          /^\s*begin;\s*$/gim
        ) || []
      ).length,
      1
    );

    assert.equal(
      (
        migration.match(
          /^\s*commit;\s*$/gim
        ) || []
      ).length,
      1
    );
  }
);


test(
  "migration mirrors are byte-identical",
  () => {
    const db =
      fs.readFileSync(
        "db/migrations/20260911_commerce_point_history_projection_v1.sql"
      );

    const supabase =
      fs.readFileSync(
        "supabase/migrations/20260911170000_commerce_point_history_projection_v1.sql"
      );

    assert.deepEqual(
      db,
      supabase
    );
  }
);
