const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const migration =
  fs.readFileSync(
    "db/migrations/20260827_cing_wallet_topup_settlement_authority_v1.sql",
    "utf8"
  );


test(
  "top-up settlement accepts payment identity only",
  () => {
    const signatureMatch =
      migration.match(
        /cing_wallet_settle_verified_topup_atomic\(([\s\S]*?)\)\s*returns/i
      );

    assert.ok(
      signatureMatch,
      "top-up settlement RPC signature must exist"
    );

    const signature =
      signatureMatch[1];

    assert.match(
      signature,
      /p_payment_transaction_id bigint/i
    );

    assert.doesNotMatch(
      signature,
      /p_user_id/i
    );

    assert.doesNotMatch(
      signature,
      /p_amount/i
    );

    assert.doesNotMatch(
      signature,
      /p_transaction_type/i
    );
  }
);


test(
  "top-up settlement locks authoritative payment row",
  () => {
    assert.match(
      migration,
      /from public\.payment_transactions[\s\S]*where id =[\s\S]*p_payment_transaction_id[\s\S]*for update/i
    );
  }
);


test(
  "top-up settlement requires wallet_topup purpose and paid state",
  () => {
    assert.match(
      migration,
      /payment_purpose <>[\s\S]*'wallet_topup'/i
    );

    assert.match(
      migration,
      /payment_status <>[\s\S]*'paid'/i
    );
  }
);


test(
  "top-up settlement requires durable provider verification",
  () => {
    assert.match(
      migration,
      /settlement_verified_at is null/i
    );

    assert.match(
      migration,
      /settlement_verification_method/i
    );

    assert.match(
      migration,
      /settlement_reference/i
    );

    assert.match(
      migration,
      /CING_WALLET_TOPUP_SETTLEMENT_NOT_VERIFIED/
    );
  }
);


test(
  "top-up amount comes from payment row and is exact whole VND",
  () => {
    assert.match(
      migration,
      /v_payment\.amount[\s\S]*trunc\(v_payment\.amount\)/i
    );

    assert.match(
      migration,
      /v_amount :=[\s\S]*v_payment\.amount::bigint/i
    );

    assert.doesNotMatch(
      migration,
      /p_amount bigint/i
    );
  }
);


test(
  "wallet user identity comes from payment authority",
  () => {
    assert.match(
      migration,
      /v_user_id :=[\s\S]*v_payment\.user_id/i
    );

    assert.doesNotMatch(
      migration,
      /p_user_id text/i
    );
  }
);


test(
  "one payment has deterministic durable wallet idempotency",
  () => {
    assert.match(
      migration,
      /'wallet_topup:payment:'[\s\S]*v_reference_id/i
    );

    assert.match(
      migration,
      /'payment_transaction'[\s\S]*v_reference_id/i
    );
  }
);


test(
  "settlement delegates balance mutation to private Wallet authority",
  () => {
    assert.match(
      migration,
      /cing_wallet_apply_mutation_private\([\s\S]*v_user_id[\s\S]*'topup'[\s\S]*v_amount[\s\S]*v_idempotency_key/i
    );

    assert.doesNotMatch(
      migration,
      /update public\.cing_wallet_accounts[\s\S]*set[\s\S]*balance/i
    );
  }
);


test(
  "settlement consumption occurs after wallet mutation in same authority",
  () => {
    const mutationPos =
      migration.indexOf(
        "cing_wallet_apply_mutation_private("
      );

    const consumePos =
      migration.indexOf(
        "update public.payment_transactions",
        mutationPos
      );

    assert.ok(
      mutationPos >= 0 &&
      consumePos > mutationPos
    );

    assert.match(
      migration.slice(
        consumePos
      ),
      /settlement_consumed_at[\s\S]*clock_timestamp\(\)/i
    );
  }
);


test(
  "consumed settlement replay returns existing ledger without second credit",
  () => {
    assert.match(
      migration,
      /settlement_consumed_at[\s\S]*is not null[\s\S]*cing_wallet_transactions[\s\S]*idempotency_key[\s\S]*return v_wallet_transaction/i
    );

    assert.match(
      migration,
      /CING_WALLET_TOPUP_CONSUMED_LEDGER_MISSING/
    );

    assert.match(
      migration,
      /CING_WALLET_TOPUP_CONSUMED_LEDGER_CONFLICT/
    );
  }
);


test(
  "top-up settlement RPC is backend-only",
  () => {
    assert.match(
      migration,
      /revoke all[\s\S]*cing_wallet_settle_verified_topup_atomic[\s\S]*from public/i
    );

    assert.match(
      migration,
      /revoke all[\s\S]*cing_wallet_settle_verified_topup_atomic[\s\S]*from anon/i
    );

    assert.match(
      migration,
      /revoke all[\s\S]*cing_wallet_settle_verified_topup_atomic[\s\S]*from authenticated/i
    );

    assert.match(
      migration,
      /grant execute[\s\S]*cing_wallet_settle_verified_topup_atomic[\s\S]*to service_role/i
    );
  }
);


test(
  "private generic wallet primitive remains private from service role",
  () => {
    const core =
      fs.readFileSync(
        "db/migrations/20260826_cing_wallet_core_authority_v1.sql",
        "utf8"
      );

    assert.match(
      core,
      /revoke all[\s\S]*cing_wallet_apply_mutation_private[\s\S]*from service_role/i
    );

    assert.doesNotMatch(
      core,
      /grant execute[\s\S]*cing_wallet_apply_mutation_private[\s\S]*to service_role/i
    );
  }
);
