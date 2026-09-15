"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const DB_FILE =
  "db/migrations/20260915_cing_wallet_pos_cashier_manual_cancel_v1.sql";

const SB_FILE =
  "supabase/migrations/20260915090000_cing_wallet_pos_cashier_manual_cancel_v1.sql";

const db = fs.readFileSync(DB_FILE, "utf8");
const sb = fs.readFileSync(SB_FILE, "utf8");

function functionBody() {
  const start = db.indexOf(
    "public.cing_wallet_cancel_manual_pos_session_v1("
  );

  assert.ok(start >= 0);

  const end = db.indexOf(
    "\n$$;",
    start
  );

  assert.ok(end > start);

  return db.slice(start, end + 4);
}

test(
  "migration mirrors remain byte-identical",
  () => {
    assert.equal(db, sb);
  }
);

test(
  "cancel authority resolves POS from authenticated admin store",
  () => {
    const body = functionBody();

    assert.match(
      body,
      /cing_wallet_resolve_counter_store_v1/
    );

    assert.match(
      body,
      /p_actor_admin_id/
    );

    assert.doesNotMatch(
      body,
      /p_pos_parent\s+text|p_pos_id\s+text/
    );
  }
);

test(
  "only amount_frozen and qr_ready are cancellable",
  () => {
    const body = functionBody();

    assert.match(
      body,
      /v_session\.status not in\s*\([\s\S]*'amount_frozen'[\s\S]*'qr_ready'/
    );

    for (const forbidden of [
      "paid",
      "reconciliation_pending",
      "reconciled",
      "reconciliation_mismatch",
      "expired",
    ]) {
      assert.doesNotMatch(
        body,
        new RegExp(
          `v_session\\.status not in[\\s\\S]{0,180}'${forbidden}'`,
          "i"
        )
      );
    }
  }
);

test(
  "qr_ready cancel locks and validates exact linked intent",
  () => {
    const body = functionBody();

    assert.match(
      body,
      /payment_intent_id is null/
    );

    assert.match(
      body,
      /for update/
    );

    assert.match(
      body,
      /v_intent\.pos_parent[\s\S]*v_session\.pos_parent/
    );

    assert.match(
      body,
      /v_intent\.pos_id[\s\S]*v_session\.pos_id/
    );

    assert.match(
      body,
      /v_intent\.amount[\s\S]*v_session\.amount/
    );
  }
);

test(
  "financial proof always fails closed",
  () => {
    const body = functionBody();

    assert.match(
      body,
      /v_intent\.status\s*=\s*'paid'/
    );

    assert.match(
      body,
      /v_intent\.customer_user_id is not null/
    );

    assert.match(
      body,
      /v_intent\.wallet_transaction_id is not null/
    );

    assert.match(
      body,
      /v_intent\.paid_at is not null/
    );

    assert.match(
      body,
      /CING_WALLET_POS_CANCEL_FINANCIAL_PROOF_PRESENT/
    );
  }
);

test(
  "pending intent and session terminalize to cancelled",
  () => {
    const body = functionBody();

    assert.match(
      body,
      /update[\s\S]*cing_wallet_pos_payment_intents[\s\S]*status\s*=\s*'cancelled'/
    );

    assert.match(
      body,
      /update[\s\S]*cing_wallet_pos_sessions[\s\S]*status\s*=\s*'cancelled'/
    );
  }
);

test(
  "cancel is request-id idempotent through durable audit fingerprint",
  () => {
    const body = functionBody();

    assert.match(
      body,
      /cashier_cancel:/
    );

    assert.match(
      body,
      /p_cancel_request_id::text/
    );

    assert.match(
      body,
      /SESSION_CANCELLED/
    );

    assert.match(
      body,
      /event_fingerprint/
    );

    assert.match(
      body,
      /REPLAY_STATE_MISMATCH/
    );
  }
);

test(
  "audit actor is canonical cashier",
  () => {
    const body = functionBody();

    assert.match(
      body,
      /'SESSION_CANCELLED'[\s\S]*'cashier'[\s\S]*v_actor_id/
    );

    assert.match(
      body,
      /'reason'[\s\S]*v_reason/
    );
  }
);

test(
  "authority is service-role only",
  () => {
    assert.match(
      db,
      /revoke all on function[\s\S]*from public, anon, authenticated/
    );

    assert.match(
      db,
      /grant execute on function[\s\S]*to service_role/
    );
  }
);

test(
  "cancel authority never mutates financial or reward domains",
  () => {
    const body = functionBody();

    const forbidden = [
      "cing_wallet_mutate_balance",
      "cing_wallet_settle_pos_payment",
      "cing_wallet_transactions",
      "pending_rewards",
      "loyalty",
      "spending",
      "purchase_reward",
      "event11",
      "sale_manager",
      "delete from",
    ];

    for (const symbol of forbidden) {
      assert.doesNotMatch(
        body,
        new RegExp(symbol, "i"),
        symbol
      );
    }
  }
);


test(
  "replay binds original cashier actor and reason",
  () => {
    assert.match(
      db,
      /a\.actor_type\s*=\s*[\s\S]*?'cashier'/
    );

    assert.match(
      db,
      /a\.actor_id\s*=\s*[\s\S]*?v_actor_id/
    );

    assert.match(
      db,
      /a\.payload\s*->>\s*'reason'[\s\S]*?v_reason/
    );

    assert.match(
      db,
      /CING_WALLET_POS_CANCEL_REPLAY_PAYLOAD_MISMATCH/
    );
  }
);

test(
  "cancel reason has no invented 500-character policy",
  () => {
    assert.doesNotMatch(
      db,
      /length\s*\(\s*v_reason\s*\)\s*>\s*500/
    );

    assert.doesNotMatch(
      db,
      /CING_WALLET_POS_CANCEL_REASON_TOO_LONG/
    );

    assert.match(
      db,
      /CING_WALLET_POS_CANCEL_REASON_REQUIRED/
    );
  }
);
