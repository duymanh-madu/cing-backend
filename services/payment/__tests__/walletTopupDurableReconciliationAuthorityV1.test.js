const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(
  path.join(
    __dirname,
    "../../../db/migrations/20260905_wallet_topup_reconciliation_authority_v1.sql"
  ),
  "utf8"
);

test("wallet topup reconciliation has one durable job per payment", () => {
  assert.match(
    migration,
    /payment_transaction_id bigint primary key[\s\S]*references public\.payment_transactions\(id\)/i
  );
});

test("new momo wallet topups auto-enroll durably", () => {
  assert.match(
    migration,
    /create trigger[\s\S]*payment_wallet_topup_reconciliation_enroll_v1[\s\S]*after insert or update/i
  );

  assert.match(
    migration,
    /payment_purpose = 'wallet_topup'[\s\S]*payment_provider[\s\S]*'momo'/i
  );
});

test("claim authority uses postgres lease and skip locked fencing", () => {
  assert.match(
    migration,
    /for update of j skip locked/i
  );

  assert.match(
    migration,
    /claim_token = gen_random_uuid\(\)/i
  );

  assert.match(
    migration,
    /lease_expires_at/i
  );
});

test("provider query success is rebound against stored financial authority", () => {
  assert.match(
    migration,
    /cing_payment_accept_momo_query_success_v1/i
  );

  assert.match(
    migration,
    /v_payment\.amount::bigint <> p_provider_amount/i
  );

  assert.match(
    migration,
    /payment_purpose <> 'wallet_topup'/i
  );

  assert.match(
    migration,
    /payment_provider[\s\S]*<> 'momo'/i
  );
});

test("provider query success creates durable verified proof", () => {
  assert.match(
    migration,
    /payment_status = 'paid'/i
  );

  assert.match(
    migration,
    /settlement_verification_method[\s\S]*'momo_status_query_v1'/i
  );

  assert.match(
    migration,
    /settlement_reference/i
  );
});

test("webhook/query race cannot silently rebind a settlement", () => {
  assert.match(
    migration,
    /settlement_verified_at is not null[\s\S]*MOMO_QUERY_EXISTING_SETTLEMENT_CONFLICT/i
  );
});

test("reconciliation cannot complete before wallet settlement consumption", () => {
  assert.match(
    migration,
    /settlement_consumed_at is null[\s\S]*WALLET_TOPUP_RECONCILIATION_SETTLEMENT_INCOMPLETE/i
  );
});

test("client roles cannot execute reconciliation financial authorities", () => {
  for (const signature of [
    "cing_payment_ensure_wallet_topup_reconciliation_v1",
    "cing_payment_claim_wallet_topup_reconciliation_v1",
    "cing_payment_accept_momo_query_success_v1",
    "cing_payment_retry_wallet_topup_reconciliation_v1",
    "cing_payment_complete_wallet_topup_reconciliation_v1",
  ]) {
    const re = new RegExp(
      `revoke all on function[\\s\\S]*?${signature}[\\s\\S]*?from public, anon, authenticated`,
      "i"
    );

    assert.match(migration, re);
  }
});
