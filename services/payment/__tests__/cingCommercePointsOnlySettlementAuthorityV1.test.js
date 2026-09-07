"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const source =
  fs.readFileSync(
    "db/migrations/20260907_commerce_points_only_settlement_authority_v1.sql",
    "utf8"
  );

const packaged =
  fs.readFileSync(
    "supabase/migrations/20260907070000_commerce_points_only_settlement_authority_v1.sql",
    "utf8"
  );

const adapter =
  fs.readFileSync(
    "services/payment/commercePointsOnlySettlementService.js",
    "utf8"
  );


test(
  "source and packaged migrations are identical",
  () => {

    assert.equal(
      source,
      packaged
    );

  }
);


test(
  "authority accepts payment identity only",
  () => {

    assert.match(
      source,
      /cing_commerce_settle_points_only_payment_v1\(\s*p_payment_transaction_id bigint\s*\)/i
    );

  }
);


test(
  "points-only authority requires exact zero monetary amount",
  () => {

    assert.match(
      source,
      /v_payment\.amount is null[\s\S]*v_payment\.amount <> 0/i
    );

  }
);


test(
  "points-only authority is bound to internal points tender",
  () => {

    assert.match(
      source,
      /payment_method[\s\S]*<> 'points'/i
    );

    assert.match(
      source,
      /payment_provider[\s\S]*<> 'internal'/i
    );

  }
);


test(
  "full coverage comes from frozen snapshot",
  () => {

    assert.match(
      source,
      /cart_snapshot[\s\S]*points_used/i
    );

    assert.match(
      source,
      /cart_snapshot[\s\S]*points_discount/i
    );

    assert.match(
      source,
      /cart_snapshot[\s\S]*pre_points_payable/i
    );

    assert.match(
      source,
      /v_points_discount <>[\s\S]*v_pre_points_payable/i
    );

  }
);


test(
  "matching point reservation is mandatory",
  () => {

    assert.match(
      source,
      /commerce_point_reservations/i
    );

    assert.match(
      source,
      /v_reservation\.points[\s\S]*v_points_used/i
    );

    assert.match(
      source,
      /v_reservation\.user_id[\s\S]*v_payment\.user_id/i
    );

  }
);


test(
  "settlement never mutates points balance or permanent point ledger",
  () => {

    assert.doesNotMatch(
      source,
      /update\s+public\.players/i
    );

    assert.doesNotMatch(
      source,
      /insert\s+into\s+public\.point_transactions/i
    );

  }
);


test(
  "settlement never touches Cing Wallet",
  () => {

    assert.doesNotMatch(
      source,
      /cing_wallet_apply_mutation_private/i
    );

    assert.doesNotMatch(
      source,
      /cing_wallet_transactions/i
    );

  }
);


test(
  "first execution writes explicit internal settlement proof",
  () => {

    assert.match(
      source,
      /payment_status\s*=\s*'paid'/i
    );

    assert.match(
      source,
      /commerce_points_internal_atomic/i
    );

  }
);


test(
  "settlement does not prematurely consume point reservation",
  () => {

    assert.doesNotMatch(
      source,
      /set[\s\S]*status\s*=\s*'consumed'/i
    );

    assert.doesNotMatch(
      source,
      /consumed_at\s*=/i
    );

  }
);


test(
  "adapter invokes bounded PostgreSQL authority with payment ID only",
  () => {

    assert.match(
      adapter,
      /cing_commerce_settle_points_only_payment_v1/
    );

    assert.match(
      adapter,
      /p_payment_transaction_id:\s*paymentId/
    );

    /*
     * Check only the argument object passed to PostgreSQL.
     *
     * The adapter is allowed to inspect data.amount from the
     * authoritative RPC response and to return amount: 0.
     */
    const rpcStart =
      adapter.indexOf(
        'await supabase.rpc('
      );

    const rpcEnd =
      adapter.indexOf(
        ');',
        rpcStart
      );

    assert.ok(
      rpcStart >= 0
    );

    assert.ok(
      rpcEnd > rpcStart
    );

    const rpcRegion =
      adapter.slice(
        rpcStart,
        rpcEnd
      );

    assert.match(
      rpcRegion,
      /p_payment_transaction_id:\s*paymentId/
    );

    assert.doesNotMatch(
      rpcRegion,
      /points_used|points_discount|user_id|\bamount\s*:/
    );

  }
);


test(
  "browser roles cannot execute authority",
  () => {

    for (
      const role
      of [
        "public",
        "anon",
        "authenticated",
      ]
    ) {

      assert.match(
        source,
        new RegExp(
          `revoke all on function[\\s\\S]*from ${role}`,
          "i"
        )
      );

    }

    assert.match(
      source,
      /grant execute on function[\s\S]*to service_role/i
    );

  }
);
