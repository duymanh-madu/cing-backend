const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const {
  processClaimedJob,
} = require(
  "../workers/walletTopupReconciliationWorker"
);


test(
  "already-consumed durable Wallet success only completes reconciliation job",
  async () => {
    const calls = [];

    const rpcCall =
      async (
        name,
        params
      ) => {
        calls.push({
          name,
          params,
        });

        return null;
      };

    const result =
      await processClaimedJob(
        {
          payment_transaction_id:
            299,

          transaction_code:
            "PAY-CONSUMED",

          payment_provider:
            "zalo_checkout",

          payment_status:
            "paid",

          amount:
            10000,

          provider_transaction_id:
            "provider-299",

          settlement_verified_at:
            "2026-09-06T18:23:19.452Z",

          settlement_verification_method:
            "zalo_checkout_callback_mac_v2",

          settlement_reference:
            "provider-299",

          settlement_consumed_at:
            "2026-09-06T18:23:19.829Z",

          attempt_count:
            1,

          claim_token:
            "00000000-0000-4000-8000-000000000299",
        },
        {
          rpcCall,

          queryTransaction:
            async () => {
              throw new Error(
                "provider query must not run"
              );
            },
        }
      );

    assert.deepEqual(
      result,
      {
        action:
          "completed_existing_settlement",
      }
    );

    assert.equal(
      calls.length,
      1
    );

    assert.equal(
      calls[0].name,
      "cing_payment_complete_wallet_topup_reconciliation_v1"
    );

    assert.equal(
      calls[0].params
        .p_payment_transaction_id,
      299
    );

    assert.doesNotMatch(
      calls
        .map(
          call =>
            call.name
        )
        .join("\n"),
      /cing_wallet_settle_verified_topup_atomic/
    );
  }
);


test(
  "V3 claim authority admits durable consumed success for lifecycle completion",
  () => {
    const migration =
      fs.readFileSync(
        "db/migrations/20260907_wallet_topup_reconciliation_consumed_completion_v3.sql",
        "utf8"
      );

    assert.match(
      migration,
      /p\.payment_status\s*=\s*[\s\S]*?'paid'/
    );

    assert.match(
      migration,
      /p\.settlement_verified_at[\s\S]*?is not null/
    );

    assert.match(
      migration,
      /p\.settlement_consumed_at[\s\S]*?is not null/
    );

    assert.match(
      migration,
      /p\.settlement_consumed_at[\s\S]*?is null[\s\S]*?or/
    );

    assert.match(
      migration,
      /j\.status in \([\s\S]*?'pending'[\s\S]*?'retry'/
    );

    assert.match(
      migration,
      /for update of j[\s\S]*?skip locked/
    );
  }
);


test(
  "worker checks consumed durable success before verified-unconsumed recovery",
  () => {
    const worker =
      fs.readFileSync(
        "services/payment/workers/walletTopupReconciliationWorker.js",
        "utf8"
      );

    const consumed =
      worker.indexOf(
        "completed_existing_settlement"
      );

    const unconsumed =
      worker.indexOf(
        "settled_existing_proof"
      );

    assert.ok(
      consumed >= 0
    );

    assert.ok(
      unconsumed > consumed
    );
  }
);


test(
  "V3 safety-net enrollment also recovers missing durable-consumed success jobs",
  () => {
    const migration =
      fs.readFileSync(
        "db/migrations/20260907_wallet_topup_reconciliation_consumed_completion_v3.sql",
        "utf8"
      );

    const insertStart =
      migration.indexOf(
        "insert into public.payment_reconciliation_jobs"
      );

    const claimStart =
      migration.indexOf(
        "return query",
        insertStart
      );

    assert.ok(
      insertStart >= 0 &&
      claimStart > insertStart
    );

    const enrollment =
      migration.slice(
        insertStart,
        claimStart
      );

    assert.match(
      enrollment,
      /p\.payment_status\s*=\s*[\s\S]*?'paid'/
    );

    assert.match(
      enrollment,
      /p\.settlement_verified_at[\s\S]*?is not null/
    );

    assert.match(
      enrollment,
      /p\.settlement_consumed_at[\s\S]*?is not null/
    );

    assert.match(
      enrollment,
      /p\.settlement_consumed_at[\s\S]*?is null[\s\S]*?or/
    );

    assert.match(
      enrollment,
      /on conflict on constraint[\s\S]*payment_reconciliation_jobs_pkey[\s\S]*do nothing/
    );
  }
);
