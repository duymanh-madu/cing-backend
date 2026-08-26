const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const migrationPath = path.resolve(
  __dirname,
  "../../../db/migrations/20260827_cing_wallet_order_payment_settlement_authority_v1.sql"
);

const sql = fs.readFileSync(migrationPath, "utf8");

test("order Wallet settlement accepts payment identity only", () => {
  assert.match(
    sql,
    /cing_wallet_settle_order_payment_atomic\s*\(\s*p_payment_transaction_id bigint\s*\)/i
  );

  assert.doesNotMatch(
    sql,
    /cing_wallet_settle_order_payment_atomic\s*\([^)]*p_user_id/i
  );

  assert.doesNotMatch(
    sql,
    /cing_wallet_settle_order_payment_atomic\s*\([^)]*p_amount/i
  );
});

test("payment row is authoritative and locked", () => {
  assert.match(
    sql,
    /from public\.payment_transactions[\s\S]*where id = p_payment_transaction_id[\s\S]*for update/i
  );

  assert.match(
    sql,
    /v_user_id :=[\s\S]*v_payment\.user_id/i
  );

  assert.match(
    sql,
    /v_amount\s*:=\s*v_payment\.amount::bigint/i
  );
});

test("authority is hard-bound to Wallet order payments", () => {
  assert.match(
    sql,
    /v_payment\.payment_purpose <> 'order'/i
  );

  assert.match(
    sql,
    /v_payment\.payment_method[\s\S]*<> 'cing_wallet'/i
  );

  assert.match(
    sql,
    /v_payment\.payment_provider[\s\S]*<> 'cing_wallet'/i
  );

  assert.match(
    sql,
    /v_payment\.payment_status[\s\S]*<> 'pending'/i
  );
});

test("Wallet debit reuses private mutation authority", () => {
  assert.match(
    sql,
    /cing_wallet_apply_mutation_private\(\s*v_user_id,\s*'payment',\s*-v_amount,\s*v_idempotency_key,\s*'Thanh toán đơn hàng bằng Cing Wallet',\s*'payment_transaction',\s*v_reference_id,\s*null,\s*'wallet_order_payment',\s*null,\s*jsonb_build_object\(/i
  );

  assert.doesNotMatch(
    sql,
    /update public\.cing_wallet_accounts[\s\S]*set[\s\S]*balance/i
  );

  assert.doesNotMatch(
    sql,
    /insert into public\.cing_wallet_transactions/i
  );
});

test("one payment has deterministic durable idempotency", () => {
  assert.match(
    sql,
    /v_reference_id\s*:=\s*v_payment\.id::text[\s\S]*v_idempotency_key\s*:=\s*'wallet_order_payment:payment:'\s*\|\|\s*v_reference_id/i
  );

  assert.match(
    sql,
    /settlement_consumed_at[\s\S]*?is not null[\s\S]*?cing_wallet_transactions[\s\S]*?idempotency_key[\s\S]*?return v_wallet_transaction/i
  );
});

test("debit and payment settlement are atomic", () => {
  const mutationPos =
    sql.indexOf("cing_wallet_apply_mutation_private(");

  const paymentUpdatePos =
    sql.indexOf("update public.payment_transactions");

  assert.ok(mutationPos >= 0);
  assert.ok(paymentUpdatePos > mutationPos);

  assert.match(
    sql,
    /payment_status = 'paid'/i
  );

  assert.match(
    sql,
    /settlement_verification_method[\s\S]*'cing_wallet_internal_atomic'/i
  );

  assert.match(
    sql,
    /settlement_consumed_at = clock_timestamp\(\)/i
  );
});

test("authority is backend-only", () => {
  assert.match(
    sql,
    /revoke all on function[\s\S]*cing_wallet_settle_order_payment_atomic\(bigint\)[\s\S]*from public/i
  );

  assert.match(
    sql,
    /revoke all on function[\s\S]*cing_wallet_settle_order_payment_atomic\(bigint\)[\s\S]*from anon/i
  );

  assert.match(
    sql,
    /revoke all on function[\s\S]*cing_wallet_settle_order_payment_atomic\(bigint\)[\s\S]*from authenticated/i
  );

  assert.match(
    sql,
    /grant execute on function[\s\S]*cing_wallet_settle_order_payment_atomic\(bigint\)[\s\S]*to service_role/i
  );
});

test("private Wallet mutation call matches canonical 11-argument contract", () => {
  assert.match(
    sql,
    /cing_wallet_apply_mutation_private\(\s*v_user_id,\s*'payment',\s*-v_amount,\s*v_idempotency_key,\s*'Thanh toán đơn hàng bằng Cing Wallet',\s*'payment_transaction',\s*v_reference_id,\s*null,\s*'wallet_order_payment',\s*null,\s*jsonb_build_object\(/i
  );
});

test("consumed replay validates immutable financial ledger semantics", () => {
  assert.match(
    sql,
    /settlement_consumed_at[\s\S]*?is not null[\s\S]*?v_wallet_transaction\.user_id[\s\S]*?v_wallet_transaction\.transaction_type[\s\S]*?'payment'[\s\S]*?v_wallet_transaction\.amount[\s\S]*?v_wallet_transaction\.reference_type[\s\S]*?'payment_transaction'[\s\S]*?v_wallet_transaction\.reference_id/i
  );

  assert.match(
    sql,
    /CING_WALLET_ORDER_PAYMENT_LEDGER_CONFLICT/i
  );
});

test("order payment ledger reference is canonical payment transaction identity", () => {
  assert.match(
    sql,
    /v_reference_id :=\s*v_payment\.id::text/i
  );

  assert.match(
    sql,
    /'wallet_order_payment:payment:'[\s\S]*\|\| v_reference_id/i
  );
});

test(
  "replay validates canonical payment semantics before returning ledger",
  () => {
    const replayPos =
      sql.indexOf(
        "if v_payment.settlement_consumed_at"
      );

    assert.ok(
      replayPos > 0
    );

    const purposePos =
      sql.indexOf(
        "v_payment.payment_purpose <> 'order'"
      );

    const methodPos =
      sql.indexOf(
        "<> 'cing_wallet'"
      );

    const userPos =
      sql.indexOf(
        "v_user_id :="
      );

    const amountValidationPos =
      sql.indexOf(
        "v_payment.amount <>"
      );

    const amountCastPos =
      sql.indexOf(
        "v_payment.amount::bigint"
      );

    assert.ok(
      purposePos >= 0 &&
      purposePos < replayPos
    );

    assert.ok(
      methodPos >= 0 &&
      methodPos < replayPos
    );

    assert.ok(
      userPos >= 0 &&
      userPos < replayPos
    );

    assert.ok(
      amountValidationPos >= 0 &&
      amountValidationPos <
        replayPos
    );

    assert.ok(
      amountCastPos >
        amountValidationPos &&
      amountCastPos <
        replayPos
    );
  }
);

test(
  "consumed replay requires canonical paid internal settlement proof",
  () => {
    assert.match(
      sql,
      /settlement_consumed_at[\s\S]*is not null[\s\S]*payment_status[\s\S]*'paid'[\s\S]*settlement_verified_at[\s\S]*settlement_verification_method[\s\S]*'cing_wallet_internal_atomic'[\s\S]*settlement_reference[\s\S]*v_reference_id/i
    );
  }
);

test(
  "consumed replay compares ledger against prevalidated canonical values",
  () => {
    assert.match(
      sql,
      /settlement_consumed_at[\s\S]*cing_wallet_transactions[\s\S]*v_wallet_transaction\.user_id[\s\S]*v_user_id[\s\S]*transaction_type[\s\S]*'payment'[\s\S]*v_wallet_transaction\.amount[\s\S]*-v_amount[\s\S]*reference_type[\s\S]*'payment_transaction'[\s\S]*reference_id[\s\S]*v_reference_id/i
    );

    const replayStart =
      sql.indexOf(
        "if v_payment.settlement_consumed_at"
      );

    const replayEnd =
      sql.indexOf(
        "return v_wallet_transaction;",
        replayStart
      );

    assert.ok(
      replayStart >= 0 &&
      replayEnd > replayStart
    );

    const replaySection =
      sql.slice(
        replayStart,
        replayEnd
      );

    assert.doesNotMatch(
      replaySection,
      /v_payment\.amount::bigint/
    );
  }
);

test(
  "new settlement remains pending-only while replay is paid-only",
  () => {
    const replayStart =
      sql.indexOf(
        "if v_payment.settlement_consumed_at"
      );

    const replayReturn =
      sql.indexOf(
        "return v_wallet_transaction;",
        replayStart
      );

    const pendingCheck =
      sql.indexOf(
        "CING_WALLET_ORDER_PAYMENT_STATUS_INVALID",
        replayReturn
      );

    assert.ok(
      replayStart >= 0 &&
      replayReturn > replayStart &&
      pendingCheck > replayReturn
    );

    assert.match(
      sql.slice(
        replayStart,
        replayReturn
      ),
      /payment_status[\s\S]*'paid'/
    );

    assert.match(
      sql.slice(
        replayReturn,
        pendingCheck + 100
      ),
      /payment_status[\s\S]*'pending'/
    );
  }
);

test("new settlement rejects pre-existing settlement proof", () => {
  assert.match(
    sql,
    /payment_status[\s\S]*'pending'[\s\S]*paid_at is not null[\s\S]*settlement_verified_at is not null[\s\S]*settlement_verification_method is not null[\s\S]*settlement_reference is not null[\s\S]*CING_WALLET_ORDER_PAYMENT_PENDING_PROOF_CONFLICT/i
  );

  const conflictPos =
    sql.indexOf(
      "CING_WALLET_ORDER_PAYMENT_PENDING_PROOF_CONFLICT"
    );

  const mutationPos =
    sql.indexOf(
      "cing_wallet_apply_mutation_private("
    );

  assert.ok(conflictPos >= 0);
  assert.ok(mutationPos >= 0);
  assert.ok(conflictPos < mutationPos);
});


test("new settlement writes exact canonical internal proof", () => {
  assert.match(
    sql,
    /update public\.payment_transactions[\s\S]*payment_status\s*=\s*'paid'[\s\S]*paid_at\s*=\s*clock_timestamp\(\)[\s\S]*settlement_verified_at\s*=\s*clock_timestamp\(\)[\s\S]*settlement_verification_method\s*=\s*'cing_wallet_internal_atomic'[\s\S]*settlement_reference\s*=\s*v_reference_id[\s\S]*settlement_consumed_at\s*=\s*clock_timestamp\(\)/i
  );

  const updateRegion =
    sql.slice(
      sql.indexOf(
        "update public.payment_transactions"
      )
    );

  assert.doesNotMatch(
    updateRegion,
    /settlement_verification_method\s*=\s*coalesce/i
  );

  assert.doesNotMatch(
    updateRegion,
    /settlement_reference\s*=\s*coalesce/i
  );
});

