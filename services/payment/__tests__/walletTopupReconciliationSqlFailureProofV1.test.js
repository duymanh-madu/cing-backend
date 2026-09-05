const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");


const migration =
  fs.readFileSync(
    path.join(
      __dirname,
      "../../../db/migrations/20260905_wallet_topup_reconciliation_authority_v1.sql"
    ),
    "utf8"
  );


test(
  "claim safety-net enrollment targets the job primary-key constraint without PLpgSQL ambiguity",
  () => {
    const start =
      migration.indexOf(
        "cing_payment_claim_wallet_topup_reconciliation_v1"
      );

    const end =
      migration.indexOf(
        "cing_payment_accept_momo_query_success_v1",
        start
      );

    const section =
      migration.slice(
        start,
        end
      );

    assert.match(
      section,
      /on conflict on constraint payment_reconciliation_jobs_pkey[\s\S]*do nothing/i
    );

    assert.doesNotMatch(
      section,
      /on conflict\s*\(\s*payment_transaction_id\s*\)/i
    );
  }
);


test(
  "concurrent workers use skip locked instead of sharing a live claim",
  () => {
    assert.match(
      migration,
      /for update of j skip locked/i
    );

    assert.match(
      migration,
      /status = 'processing'[\s\S]*lease_expires_at <= v_now/i
    );
  }
);


test(
  "every claim receives a fresh fencing token",
  () => {
    assert.match(
      migration,
      /claim_token = gen_random_uuid\(\)/i
    );

    assert.match(
      migration,
      /claim_token is distinct from p_claim_token/i
    );
  }
);


test(
  "stale expired worker cannot accept provider success",
  () => {
    const start =
      migration.indexOf(
        "cing_payment_accept_momo_query_success_v1"
      );

    const end =
      migration.indexOf(
        "cing_payment_retry_wallet_topup_reconciliation_v1",
        start
      );

    const section =
      migration.slice(
        start,
        end
      );

    assert.match(
      section,
      /lease_expires_at <= v_now[\s\S]*MOMO_QUERY_RECONCILIATION_CLAIM_INVALID/i
    );
  }
);


test(
  "expired worker cannot move reconciliation job into retry",
  () => {
    const start =
      migration.indexOf(
        "cing_payment_retry_wallet_topup_reconciliation_v1"
      );

    const end =
      migration.indexOf(
        "cing_payment_complete_wallet_topup_reconciliation_v1",
        start
      );

    const section =
      migration.slice(
        start,
        end
      );

    assert.match(
      section,
      /status = 'processing'[\s\S]*claim_token is not distinct from[\s\S]*lease_expires_at > v_now/i
    );
  }
);


test(
  "expired worker cannot complete reconciliation job before reclaim",
  () => {
    const start =
      migration.indexOf(
        "cing_payment_complete_wallet_topup_reconciliation_v1"
      );

    const end =
      migration.indexOf(
        "cing_payment_terminal_fail_wallet_topup_reconciliation_v1",
        start
      );

    const section =
      migration.slice(
        start,
        end
      );

    assert.match(
      section,
      /status <> 'processing'[\s\S]*claim_token is distinct from p_claim_token[\s\S]*lease_expires_at <= v_now[\s\S]*WALLET_TOPUP_RECONCILIATION_CLAIM_MISMATCH/i
    );
  }
);


test(
  "wallet topup is only complete after settlement_consumed_at exists",
  () => {
    const start =
      migration.indexOf(
        "cing_payment_complete_wallet_topup_reconciliation_v1"
      );

    const section =
      migration.slice(
        start
      );

    assert.match(
      section,
      /settlement_consumed_at is null[\s\S]*WALLET_TOPUP_RECONCILIATION_SETTLEMENT_INCOMPLETE/i
    );
  }
);


test(
  "successful settlement cannot later be downgraded to terminal failure",
  () => {
    const start =
      migration.indexOf(
        "cing_payment_terminal_fail_wallet_topup_reconciliation_v1"
      );

    const section =
      migration.slice(
        start
      );

    assert.match(
      section,
      /settlement_verified_at is not null[\s\S]*settlement_consumed_at is not null[\s\S]*payment_status = 'paid'[\s\S]*WALLET_TOPUP_RECONCILIATION_SUCCESS_ALREADY_DURABLE/i
    );
  }
);


test(
  "database itself keeps unresolved wallet topups inside reconciliation radar",
  () => {
    assert.match(
      migration,
      /insert into public\.payment_reconciliation_jobs[\s\S]*payment_purpose = 'wallet_topup'[\s\S]*settlement_consumed_at is null[\s\S]*payment_status in \('pending', 'paid'\)/i
    );
  }
);
