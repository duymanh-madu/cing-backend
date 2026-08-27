const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../db/migrations/20260827_cing_commerce_post_order_effect_authority_v1.sql"
  ),
  "utf8"
);

test(
  "commerce point deduction trusts canonical paid order",
  () => {
    assert.match(
      migration,
      /cing_commerce_apply_order_points_deduct_v1[\s\S]*from public\.orders[\s\S]*payment_status is distinct from 'paid'/i
    );

    assert.match(
      migration,
      /v_order\.points_used/i
    );
  }
);

test(
  "commerce point deduction serializes player balance",
  () => {
    assert.match(
      migration,
      /cing_commerce_apply_order_points_deduct_v1[\s\S]*from public\.players[\s\S]*for update/i
    );
  }
);

test(
  "commerce point deduction fails closed on insufficient balance",
  () => {
    assert.match(
      migration,
      /v_before < v_points[\s\S]*COMMERCE_POINT_DEDUCT_INSUFFICIENT_POINTS/i
    );
  }
);

test(
  "commerce point deduction writes balance and durable ledger",
  () => {
    assert.match(
      migration,
      /cing_commerce_apply_order_points_deduct_v1[\s\S]*update public\.players[\s\S]*insert into public\.point_transactions/i
    );

    assert.match(
      migration,
      /'deduct'[\s\S]*-v_points/i
    );
  }
);

test(
  "commerce order point effects have durable database uniqueness",
  () => {
    assert.match(
      migration,
      /create unique index if not exists[\s\S]*point_transactions_commerce_order_effect_uidx[\s\S]*commerce_order_id[\s\S]*transaction_type/i
    );

    assert.match(
      migration,
      /transaction_type in\s*\(\s*'deduct',\s*'add'\s*\)/i
    );
  }
);

test(
  "commerce point idempotency is rechecked after player lock",
  () => {
    assert.match(
      migration,
      /cing_commerce_apply_order_points_deduct_v1[\s\S]*for update[\s\S]*from public\.point_transactions[\s\S]*transaction_type = 'deduct'/i
    );

    assert.match(
      migration,
      /cing_commerce_apply_order_points_earn_v1[\s\S]*for update[\s\S]*from public\.point_transactions[\s\S]*transaction_type = 'add'/i
    );
  }
);

test(
  "after-hours earn derives spend amount inside PostgreSQL",
  () => {
    assert.match(
      migration,
      /cing_commerce_apply_order_points_earn_v1[\s\S]*v_order\.total_amount/i
    );

    assert.match(
      migration,
      /floor\s*\(\s*\(v_amount \* v_rate\)\s*\/\s*1000\s*\)/i
    );
  }
);

test(
  "after-hours earn preserves current membership point rates",
  () => {
    for (const tier of [
      "member",
      "loyal",
      "silver",
      "gold",
      "diamond",
      "partner",
    ]) {
      assert.match(
        migration,
        new RegExp(
          `when '${tier}' then 0\\.10`,
          "i"
        )
      );
    }

    assert.match(
      migration,
      /when 'loyal_partner' then 0\.15/i
    );
  }
);

test(
  "after-hours earn serializes balance and writes authoritative ledger",
  () => {
    assert.match(
      migration,
      /cing_commerce_apply_order_points_earn_v1[\s\S]*from public\.players[\s\S]*for update[\s\S]*update public\.players[\s\S]*insert into public\.point_transactions/i
    );

    assert.match(
      migration,
      /'after_hours_app_order'/i
    );
  }
);

test(
  "point balance arithmetic is exact integer-domain arithmetic",
  () => {
    assert.match(
      migration,
      /v_balance_numeric <> trunc\(v_balance_numeric\)/i
    );

    assert.match(
      migration,
      /2147483647 - v_points/i
    );
  }
);

test(
  "commerce point mutation functions are backend only",
  () => {
    for (const signature of [
      "cing_commerce_apply_order_points_deduct_v1\\(bigint\\)",
      "cing_commerce_apply_order_points_earn_v1\\(bigint, text\\)",
    ]) {
      assert.match(
        migration,
        new RegExp(
          `revoke all on function[\\s\\S]*public\\.${signature}[\\s\\S]*from authenticated`,
          "i"
        )
      );

      assert.match(
        migration,
        new RegExp(
          `grant execute on function[\\s\\S]*public\\.${signature}[\\s\\S]*to service_role`,
          "i"
        )
      );
    }
  }
);

test(
  "point authority does not move iPOS ownership into PostgreSQL",
  () => {
    const deductStart =
      migration.indexOf(
        "public.cing_commerce_apply_order_points_deduct_v1"
      );

    const earnStart =
      migration.indexOf(
        "public.cing_commerce_apply_order_points_earn_v1"
      );

    assert.ok(deductStart >= 0);
    assert.ok(earnStart >= 0);

    const authorityRegion =
      migration.slice(deductStart);

    assert.doesNotMatch(
      authorityRegion,
      /updateMemberPoint|foodbook|ipos webhook|http_post|net\.http/i
    );
  }
);


test(
  "forensic legacy orders 139 and 185 are classified as non-executed deductions",
  () => {
    assert.match(
      migration,
      /HISTORICAL POINT-DEDUCTION CLASSIFICATION V1/i
    );

    assert.match(
      migration,
      /139[\s\S]*points_used[\s\S]*5/i
    );

    assert.match(
      migration,
      /185[\s\S]*points_used[\s\S]*30/i
    );

    assert.match(
      migration,
      /COMMERCE_LEGACY_POINT_DEDUCT_ORDER_SET_CHANGED/i
    );

    assert.match(
      migration,
      /COMMERCE_LEGACY_POINT_DEDUCT_ORDER_SHAPE_CHANGED/i
    );

    assert.match(
      migration,
      /COMMERCE_LEGACY_POINT_DEDUCT_UNEXPECTED_LEDGER/i
    );
  }
);

test(
  "legacy non-executed deductions are never reconstructed into point ledger",
  () => {
    const classificationStart =
      migration.indexOf(
        "HISTORICAL POINT-DEDUCTION CLASSIFICATION V1"
      );

    const deductFunctionStart =
      migration.indexOf(
        "public.cing_commerce_apply_order_points_deduct_v1("
      );

    assert.ok(classificationStart >= 0);
    assert.ok(deductFunctionStart > classificationStart);

    const classificationRegion =
      migration.slice(
        classificationStart,
        deductFunctionStart
      );

    assert.doesNotMatch(
      classificationRegion,
      /\binsert\s+into\s+public\.point_transactions\b/i
    );

    assert.doesNotMatch(
      classificationRegion,
      /\bupdate\s+public\.players\b/i
    );
  }
);

test(
  "deduction authority preserves exact legacy non-executed orders as no-op",
  () => {
    const deductStart =
      migration.indexOf(
        "public.cing_commerce_apply_order_points_deduct_v1("
      );

    const earnStart =
      migration.indexOf(
        "public.cing_commerce_apply_order_points_earn_v1(",
        deductStart
      );

    assert.ok(deductStart >= 0);
    assert.ok(earnStart > deductStart);

    const deductRegion =
      migration.slice(
        deductStart,
        earnStart
      );

    assert.match(
      deductRegion,
      /v_order\.id = 139[\s\S]*v_points = 5/i
    );

    assert.match(
      deductRegion,
      /v_order\.id = 185[\s\S]*v_points = 30/i
    );

    assert.match(
      deductRegion,
      /v_order\.id = 185[\s\S]*return query[\s\S]*null::integer[\s\S]*null::integer[\s\S]*false[\s\S]*return;/i
    );

    const legacyFence =
      deductRegion.indexOf(
        "Exact forensic legacy fence."
      );

    const playerMutation =
      deductRegion.indexOf(
        "update public.players"
      );

    const ledgerMutation =
      deductRegion.indexOf(
        "insert into public.point_transactions"
      );

    assert.ok(legacyFence >= 0);
    assert.ok(playerMutation > legacyFence);
    assert.ok(ledgerMutation > legacyFence);
  }
);

test(
  "legacy deduction classification does not use a deployment-time cutoff",
  () => {
    const start =
      migration.indexOf(
        "HISTORICAL POINT-DEDUCTION CLASSIFICATION V1"
      );

    const end =
      migration.indexOf(
        "Durable per-order Commerce point-effect uniqueness.",
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const region =
      migration.slice(start, end);

    assert.doesNotMatch(
      region,
      /created_at\s*[<>=]|4297e0e.*::timestamptz/i
    );
  }
);

