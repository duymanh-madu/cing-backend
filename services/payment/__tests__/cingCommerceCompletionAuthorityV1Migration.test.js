"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const sql =
  fs.readFileSync(
    "db/migrations/20260827_zz_cing_commerce_completion_authority_v1.sql",
    "utf8"
  );


test(
  "commerce completion V1 preserves historical repair audit",
  () => {
    assert.match(
      sql,
      /create table if not exists[\s\S]*cing_commerce_order_payment_legacy_repair_audit/i
    );

    assert.match(
      sql,
      /legacy_payment_transaction_id bigint not null/i
    );

    assert.match(
      sql,
      /canonical_order_id bigint not null/i
    );

    assert.match(
      sql,
      /legacy_duplicate_payment_transaction_link_v1/i
    );
  }
);


test(
  "historical repair is fail closed on canonical payment pointers",
  () => {
    assert.match(
      sql,
      /p\.id = 42[\s\S]*p\.order_id = 42[\s\S]*p\.order_created is true/i
    );

    assert.match(
      sql,
      /p\.id = 44[\s\S]*p\.order_id = 41[\s\S]*p\.order_created is true/i
    );
  }
);


test(
  "historical repair requires exact audited duplicate shape",
  () => {
    assert.match(
      sql,
      /31,\s*32,\s*33,\s*34,\s*35,[\s\S]*36,\s*37[\s\S]*payment_transaction_id = 42/i
    );

    assert.match(
      sql,
      /39,\s*40[\s\S]*payment_transaction_id = 44/i
    );

    assert.match(
      sql,
      /status = 'pending_payment'[\s\S]*status_code = 'pending_payment'[\s\S]*payment_status = 'paid'/i
    );
  }
);


test(
  "repair fails closed if legacy order has active iPOS recovery",
  () => {
    assert.match(
      sql,
      /from public\.ipos_sync_queue[\s\S]*order_numeric_id in[\s\S]*31[\s\S]*40[\s\S]*status in[\s\S]*'pending'[\s\S]*'processing'/i
    );

    assert.match(
      sql,
      /CING_COMMERCE_LEGACY_REPAIR_ACTIVE_IPOS_RECOVERY/i
    );
  }
);


test(
  "repair detaches only payment link and preserves order history",
  () => {
    assert.match(
      sql,
      /update public\.orders[\s\S]*payment_transaction_id = null/i
    );

    assert.doesNotMatch(
      sql,
      /delete\s+from\s+public\.orders/i
    );

    assert.doesNotMatch(
      sql,
      /delete\s+from\s+public\.ipos_logs/i
    );
  }
);


test(
  "canonical orders remain linked after legacy repair",
  () => {
    assert.match(
      sql,
      /id = 42[\s\S]*payment_transaction_id = 42/i
    );

    assert.match(
      sql,
      /id = 41[\s\S]*payment_transaction_id = 44/i
    );

    assert.match(
      sql,
      /CING_COMMERCE_LEGACY_REPAIR_CANONICAL_42_LOST/i
    );

    assert.match(
      sql,
      /CING_COMMERCE_LEGACY_REPAIR_CANONICAL_44_LOST/i
    );
  }
);


test(
  "migration refuses any remaining duplicate payment order link",
  () => {
    assert.match(
      sql,
      /group by payment_transaction_id[\s\S]*having count\(\*\) > 1/i
    );

    assert.match(
      sql,
      /CING_COMMERCE_PAYMENT_ORDER_DUPLICATE_REMAINS/i
    );
  }
);


test(
  "database enforces one non-null payment transaction per order",
  () => {
    assert.match(
      sql,
      /create unique index if not exists[\s\S]*orders_payment_transaction_id_unique_v1[\s\S]*on public\.orders[\s\S]*payment_transaction_id[\s\S]*where payment_transaction_id is not null/i
    );
  }
);


test(
  "repair audit is not client readable",
  () => {
    assert.match(
      sql,
      /revoke all on table[\s\S]*cing_commerce_order_payment_legacy_repair_audit[\s\S]*from anon/i
    );

    assert.match(
      sql,
      /revoke all on table[\s\S]*cing_commerce_order_payment_legacy_repair_audit[\s\S]*from authenticated/i
    );

    assert.match(
      sql,
      /CING_COMMERCE_LEGACY_REPAIR_AUDIT_ANON_READ_FORBIDDEN/i
    );

    assert.match(
      sql,
      /CING_COMMERCE_LEGACY_REPAIR_AUDIT_AUTH_READ_FORBIDDEN/i
    );
  }
);
