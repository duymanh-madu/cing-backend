const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const path =
  require("path");

const migration =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20260826_payment_settlement_foundation_v1.sql"
    ),
    "utf8"
  );

test(
  "Payment settlement V1 introduces explicit order and wallet_topup purposes",
  () => {
    assert.match(
      migration,
      /payment_purpose text[\s\S]*default 'order'/i
    );

    assert.match(
      migration,
      /'order'[\s\S]*'wallet_topup'/i
    );
  }
);

test(
  "Wallet top-up settlement requires positive whole-dong amount",
  () => {
    assert.match(
      migration,
      /payment_purpose <> 'wallet_topup'[\s\S]*amount is not null[\s\S]*amount > 0[\s\S]*amount = trunc\(amount\)/i
    );
  }
);

test(
  "Wallet top-up settlement requires provider and transaction identity",
  () => {
    assert.match(
      migration,
      /payment_transactions_wallet_topup_identity_ck/i
    );

    for (const field of [
      "transaction_code",
      "payment_provider",
      "payment_method",
    ]) {
      assert.match(
        migration,
        new RegExp(field)
      );
    }
  }
);

test(
  "Settlement proof requires verification method and reference",
  () => {
    assert.match(
      migration,
      /settlement_verified_at[\s\S]*settlement_verification_method[\s\S]*settlement_reference/i
    );
  }
);

test(
  "Settlement cannot be consumed before verification",
  () => {
    assert.match(
      migration,
      /settlement_consumed_at is null[\s\S]*settlement_verified_at is not null/i
    );
  }
);

test(
  "Payment settlement V1 hardens internal transaction uniqueness",
  () => {
    assert.match(
      migration,
      /create unique index[\s\S]*payment_transactions_transaction_code_uq[\s\S]*transaction_code/i
    );
  }
);

test(
  "Payment settlement V1 hardens provider settlement uniqueness",
  () => {
    assert.match(
      migration,
      /create unique index[\s\S]*payment_transactions_provider_transaction_uq[\s\S]*payment_provider[\s\S]*provider_transaction_id/i
    );
  }
);

test(
  "Legacy order rows remain compatible",
  () => {
    assert.doesNotMatch(
      migration,
      /alter column amount set not null/i
    );

    assert.doesNotMatch(
      migration,
      /alter column provider_transaction_id set not null/i
    );
  }
);
