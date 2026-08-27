const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const migration =
  fs.readFileSync(
    "db/migrations/20260828_cing_wallet_topup_promotion_settlement_v2.sql",
    "utf8"
  );

test(
  "promotion decision is durably frozen on authoritative payment",
  () => {
    assert.match(
      migration,
      /wallet_topup_promotion_snapshot jsonb/i
    );

    assert.match(
      migration,
      /v_payment\.wallet_topup_promotion_snapshot/i
    );

    assert.match(
      migration,
      /wallet_topup_promotion_snapshot\s*=\s*v_promotion_snapshot/i
    );
  }
);

test(
  "promotion snapshot distinguishes qualified and unqualified settlements",
  () => {
    assert.match(
      migration,
      /'qualified', true/i
    );

    assert.match(
      migration,
      /'qualified', false/i
    );
  }
);

test(
  "promotion is active only inside configured time window",
  () => {
    assert.match(
      migration,
      /c\.enabled/i
    );

    assert.match(
      migration,
      /c\.starts_at is null[\s\S]*clock_timestamp\(\) >= c\.starts_at/i
    );

    assert.match(
      migration,
      /c\.ends_at is null[\s\S]*clock_timestamp\(\) < c\.ends_at/i
    );
  }
);

test(
  "highest qualified threshold is selected",
  () => {
    assert.match(
      migration,
      /pt\.min_topup_amount <= v_amount[\s\S]*order by[\s\S]*pt\.min_topup_amount desc[\s\S]*limit 1/i
    );
  }
);

test(
  "promotion retry never requires current configuration re-evaluation",
  () => {
    const snapshotRead =
      migration.indexOf(
        "v_payment.wallet_topup_promotion_snapshot"
      );

    const configRead =
      migration.indexOf(
        "cing_wallet_topup_promotion_config",
        snapshotRead
      );

    const nullGuard =
      migration.indexOf(
        "if v_promotion_snapshot is null then",
        snapshotRead
      );

    assert.ok(snapshotRead >= 0);
    assert.ok(nullGuard > snapshotRead);
    assert.ok(configRead > nullGuard);
  }
);

test(
  "base and promotion credits have independent durable identities",
  () => {
    assert.match(
      migration,
      /'wallet_topup:payment:'/
    );

    assert.match(
      migration,
      /'wallet_topup_promotion:payment:'/
    );
  }
);

test(
  "promotion credit uses canonical private Wallet authority",
  () => {
    assert.match(
      migration,
      /cing_wallet_apply_mutation_private\([\s\S]*'topup_promotion'[\s\S]*v_promotion_bonus[\s\S]*v_promotion_idempotency_key/i
    );
  }
);

test(
  "settlement credits base before promotion and consumes only afterward",
  () => {
    const base =
      migration.indexOf(
        "'topup',\n    v_amount"
      );

    const bonus =
      migration.indexOf(
        "'topup_promotion',\n      v_promotion_bonus"
      );

    const consume =
      migration.indexOf(
        "update public.payment_transactions",
        bonus
      );

    assert.ok(base >= 0);
    assert.ok(bonus > base);
    assert.ok(consume > bonus);
  }
);

test(
  "consumed qualified replay requires promotion ledger",
  () => {
    assert.match(
      migration,
      /CING_WALLET_PROMOTION_CONSUMED_LEDGER_MISSING/
    );

    assert.match(
      migration,
      /CING_WALLET_PROMOTION_CONSUMED_LEDGER_CONFLICT/
    );
  }
);

test(
  "consumed unqualified replay rejects unexpected promotion ledger",
  () => {
    assert.match(
      migration,
      /CING_WALLET_PROMOTION_UNQUALIFIED_LEDGER_CONFLICT/
    );
  }
);

test(
  "settlement public signature remains payment identity only",
  () => {
    const match =
      migration.match(
        /cing_wallet_settle_verified_topup_atomic\(([\s\S]*?)\)\s*returns/i
      );

    assert.ok(match);

    assert.match(
      match[1],
      /p_payment_transaction_id bigint/i
    );

    assert.doesNotMatch(
      match[1],
      /p_user_id|p_amount|p_bonus/i
    );
  }
);

test(
  "settlement remains backend only",
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
  "migration is one PostgreSQL transaction",
  () => {
    assert.match(
      migration,
      /^\s*begin;/i
    );

    assert.match(
      migration,
      /commit;\s*$/i
    );
  }
);

test(
  "legacy consumed settlement without snapshot is permanently unqualified",
  () => {
    assert.match(
      migration,
      /v_promotion_snapshot is null[\s\S]*v_payment\.settlement_consumed_at is not null[\s\S]*'qualified', false[\s\S]*elsif v_promotion_snapshot is null/i
    );
  }
);

test(
  "legacy consumed settlement is classified before current promotion lookup",
  () => {
    const legacyBranch =
      migration.indexOf(
        "and v_payment.settlement_consumed_at is not null"
      );

    const unqualified =
      migration.indexOf(
        "'qualified', false",
        legacyBranch
      );

    const currentConfig =
      migration.indexOf(
        "cing_wallet_topup_promotion_config",
        legacyBranch
      );

    assert.ok(legacyBranch >= 0);
    assert.ok(unqualified > legacyBranch);
    assert.ok(currentConfig > unqualified);
  }
);
