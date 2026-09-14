"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const test =
  require("node:test");


const migration =
  fs.readFileSync(
    "db/migrations/20260914_cing_wallet_pos_store_history_snapshot_v1.sql",
    "utf8"
  );

const mirror =
  fs.readFileSync(
    "supabase/migrations/20260914045500_cing_wallet_pos_store_history_snapshot_v1.sql",
    "utf8"
  );

const readService =
  fs.readFileSync(
    "services/wallet/cingWalletReadService.js",
    "utf8"
  );


function settlementBody() {
  const start =
    migration.indexOf(
      "public.cing_wallet_settle_pos_payment_atomic_v1("
    );

  const end =
    migration.indexOf(
      "revoke all on function",
      start
    );

  assert.ok(
    start >= 0 &&
    end > start
  );

  return migration.slice(
    start,
    end
  );
}


function customerProjection() {
  const start =
    readService.indexOf(
      "function resolveCustomerSafePosPaymentMetadata"
    );

  const end =
    readService.indexOf(
      "\nfunction normalizeWalletTransaction",
      start
    );

  assert.ok(
    start >= 0 &&
    end > start
  );

  return readService.slice(
    start,
    end
  );
}


test(
  "A7.2B settlement migration mirrors remain byte-identical",
  () => {
    assert.equal(
      migration,
      mirror
    );
  }
);


test(
  "settlement keeps the exact existing RPC signature",
  () => {
    assert.match(
      migration,
      /cing_wallet_settle_pos_payment_atomic_v1\(\s*p_payment_token_id uuid,\s*p_user_id text\s*\)/
    );

    const signature =
      migration.match(
        /cing_wallet_settle_pos_payment_atomic_v1\(([\s\S]*?)\)\s*returns table/
      );

    assert.ok(
      signature
    );

    assert.doesNotMatch(
      signature[1],
      /amount|store|pos_parent|pos_id/i
    );
  }
);


test(
  "payment intent remains locked before Wallet mutation",
  () => {
    const body =
      settlementBody();

    const lock =
      body.indexOf(
        "for update"
      );

    const mutation =
      body.indexOf(
        "from public.cing_wallet_apply_mutation_private("
      );

    assert.ok(
      lock >= 0
    );

    assert.ok(
      mutation > lock
    );
  }
);


test(
  "settlement still performs exactly one canonical Wallet mutation",
  () => {
    const body =
      settlementBody();

    const calls =
      (
        body.match(
          /from public\.cing_wallet_apply_mutation_private\(/g
        ) || []
      ).length;

    assert.equal(
      calls,
      1
    );

    assert.match(
      body,
      /'wallet_pos_payment:intent:'[\s\S]*v_intent\.id::text/
    );

    assert.match(
      body,
      /'payment'[\s\S]*-v_intent\.amount/
    );
  }
);


test(
  "settlement never queries live store registry",
  () => {
    const body =
      settlementBody();

    assert.doesNotMatch(
      body,
      /cing_wallet_pos_stores/
    );

    assert.doesNotMatch(
      body,
      /join[\s\S]{0,100}store/i
    );
  }
);


test(
  "partial payment-intent store snapshot fails closed before mutation",
  () => {
    const body =
      settlementBody();

    const validation =
      body.indexOf(
        "CING_WALLET_POS_STORE_SNAPSHOT_INVALID"
      );

    const mutation =
      body.indexOf(
        "from public.cing_wallet_apply_mutation_private("
      );

    assert.ok(
      validation >= 0
    );

    assert.ok(
      validation < mutation
    );
  }
);


test(
  "atomic Wallet ledger copies immutable store tuple",
  () => {
    const body =
      settlementBody();

    assert.match(
      body,
      /'store_id'[\s\S]*v_intent\.metadata->>'store_id'/
    );

    assert.match(
      body,
      /'store_code'[\s\S]*v_intent\.metadata->>'store_code'/
    );

    assert.match(
      body,
      /'store_display_name'[\s\S]*v_intent\.metadata->>'store_display_name'/
    );
  }
);


test(
  "successful replay proves ledger store snapshot matches intent snapshot",
  () => {
    const body =
      settlementBody();

    assert.match(
      body,
      /v_wallet_transaction\.metadata->>'store_id'[\s\S]*v_intent\.metadata->>'store_id'/
    );

    assert.match(
      body,
      /v_wallet_transaction\.metadata->>'store_code'[\s\S]*v_intent\.metadata->>'store_code'/
    );

    assert.match(
      body,
      /v_wallet_transaction\.metadata->>'store_display_name'[\s\S]*v_intent\.metadata->>'store_display_name'/
    );

    assert.match(
      body,
      /CING_WALLET_POS_LEDGER_STORE_SNAPSHOT_CONFLICT/
    );
  }
);


test(
  "legacy intents with no store snapshot remain supported",
  () => {
    const body =
      settlementBody();

    assert.match(
      body,
      /case[\s\S]*when[\s\S]*store_id[\s\S]*store_code[\s\S]*store_display_name[\s\S]*then[\s\S]*jsonb_build_object[\s\S]*else[\s\S]*'\{\}'::jsonb/
    );
  }
);


test(
  "customer POS history reads Wallet ledger metadata only",
  () => {
    assert.match(
      readService,
      /\.from\(\s*"cing_wallet_transactions"\s*\)/
    );

    const projection =
      customerProjection();

    assert.match(
      projection,
      /row\?\.metadata/
    );

    assert.doesNotMatch(
      projection,
      /cing_wallet_pos_stores/
    );
  }
);


test(
  "customer POS history exposes only store display name",
  () => {
    const projection =
      customerProjection();

    assert.match(
      projection,
      /store_display_name/
    );

    for (
      const forbidden
      of [
        "bill_reference",
        "pos_parent",
        "pos_id",
        "store_id",
        "store_code",
        "provider_request_key",
        "payment_token_id",
        "reconciliation",
        "event11",
      ]
    ) {
      assert.equal(
        projection.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);


test(
  "customer history has no Event11 or reconciliation dependency",
  () => {
    const projection =
      customerProjection();

    assert.doesNotMatch(
      projection,
      /event11|reconciliation|sale_tran_id/i
    );
  }
);


test(
  "settlement authority remains service-role only",
  () => {
    assert.match(
      migration,
      /revoke all on function[\s\S]*cing_wallet_settle_pos_payment_atomic_v1[\s\S]*from public, anon, authenticated/
    );

    assert.match(
      migration,
      /grant execute on function[\s\S]*cing_wallet_settle_pos_payment_atomic_v1[\s\S]*to service_role/
    );
  }
);
