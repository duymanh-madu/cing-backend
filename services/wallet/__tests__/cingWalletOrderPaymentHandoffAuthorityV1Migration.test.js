const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const migrationPath = path.resolve(
  __dirname,
  "../../../db/migrations/20260827_z_cing_wallet_order_payment_handoff_authority_v1.sql"
);

const sql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

test(
  "handoff accepts payment transaction identity only",
  () => {
    assert.match(
      sql,
      /cing_wallet_settle_order_payment_handoff_atomic\s*\(\s*p_payment_transaction_id bigint\s*\)/i
    );

    assert.doesNotMatch(
      sql,
      /cing_wallet_settle_order_payment_handoff_atomic\s*\([^)]*p_user_id/i
    );

    assert.doesNotMatch(
      sql,
      /cing_wallet_settle_order_payment_handoff_atomic\s*\([^)]*p_amount/i
    );
  }
);

test(
  "handoff delegates financial mutation exclusively to proven V1 authority",
  () => {
    assert.match(
      sql,
      /from public\.cing_wallet_settle_order_payment_atomic\(\s*p_payment_transaction_id\s*\)/i
    );

    assert.doesNotMatch(
      sql,
      /cing_wallet_apply_mutation_private\s*\(/i
    );

    assert.doesNotMatch(
      sql,
      /update public\.cing_wallet_accounts/i
    );

    assert.doesNotMatch(
      sql,
      /insert into public\.cing_wallet_transactions/i
    );
  }
);

test(
  "handoff returns bounded commerce contract rather than raw Wallet ledger",
  () => {
    assert.match(
      sql,
      /returns table\s*\(\s*payment_transaction_id bigint,\s*transaction_code text,\s*settlement_reference text,\s*amount bigint\s*\)/i
    );

    assert.doesNotMatch(
      sql,
      /returns public\.cing_wallet_transactions/i
    );
  }
);

test(
  "handoff reads positive amount only from canonical payment row",
  () => {
    assert.match(
      sql,
      /v_payment\.amount[\s\S]*v_amount\s*:=\s*v_payment\.amount::bigint/i
    );

    assert.match(
      sql,
      /amount\s*:=\s*v_amount/i
    );

    assert.doesNotMatch(
      sql,
      /amount\s*:=\s*v_wallet_transaction\.amount/i
    );
  }
);

test(
  "handoff cross-checks negative Wallet debit against positive commerce amount",
  () => {
    assert.match(
      sql,
      /v_wallet_transaction\.transaction_type[\s\S]*'payment'[\s\S]*v_wallet_transaction\.amount[\s\S]*-v_amount/i
    );

    assert.match(
      sql,
      /v_wallet_transaction\.reference_type[\s\S]*'payment_transaction'[\s\S]*v_wallet_transaction\.reference_id[\s\S]*v_reference_id/i
    );
  }
);

test(
  "handoff requires canonical paid internal settlement proof",
  () => {
    assert.match(
      sql,
      /payment_status[\s\S]*'paid'/i
    );

    assert.match(
      sql,
      /settlement_consumed_at is null/i
    );

    assert.match(
      sql,
      /settlement_verified_at is null/i
    );

    assert.match(
      sql,
      /settlement_verification_method[\s\S]*'cing_wallet_internal_atomic'/i
    );

    assert.match(
      sql,
      /settlement_reference[\s\S]*v_reference_id/i
    );
  }
);

test(
  "handoff returns canonical transaction code and settlement reference",
  () => {
    assert.match(
      sql,
      /transaction_code\s*:=\s*btrim\(\s*v_payment\.transaction_code\s*\)/i
    );

    assert.match(
      sql,
      /settlement_reference\s*:=\s*v_reference_id/i
    );
  }
);

test(
  "handoff is backend-only",
  () => {
    assert.match(
      sql,
      /revoke all on function[\s\S]*cing_wallet_settle_order_payment_handoff_atomic\(bigint\)[\s\S]*from public/i
    );

    assert.match(
      sql,
      /revoke all on function[\s\S]*cing_wallet_settle_order_payment_handoff_atomic\(bigint\)[\s\S]*from anon/i
    );

    assert.match(
      sql,
      /revoke all on function[\s\S]*cing_wallet_settle_order_payment_handoff_atomic\(bigint\)[\s\S]*from authenticated/i
    );

    assert.match(
      sql,
      /grant execute on function[\s\S]*cing_wallet_settle_order_payment_handoff_atomic\(bigint\)[\s\S]*to service_role/i
    );
  }
);

test(
  "compatibility checkpoint preserves V1 authority",
  () => {
    assert.match(
      sql,
      /to_regprocedure\([\s\S]*cing_wallet_settle_order_payment_atomic\(bigint\)[\s\S]*CING_WALLET_ORDER_PAYMENT_V1_AUTHORITY_MISSING/i
    );

    assert.doesNotMatch(
      sql,
      /revoke all on function\s+public\.cing_wallet_settle_order_payment_atomic\(bigint\)\s+from service_role/i
    );
  }
);
