"use strict";

const assert =
  require("node:assert/strict");

const crypto =
  require("node:crypto");

const fs =
  require("node:fs");

const test =
  require("node:test");


const DB =
  "db/migrations/20260914_cing_wallet_pos_reconciliation_resolution_authority_v1.sql";

const SB =
  "supabase/migrations/20260914053000_cing_wallet_pos_reconciliation_resolution_authority_v1.sql";

const source =
  fs.readFileSync(
    DB,
    "utf8"
  );


function hash(path) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      fs.readFileSync(
        path
      )
    )
    .digest(
      "hex"
    );
}


function rpcBody() {
  const start =
    source.indexOf(
      "public.cing_wallet_resolve_pos_reconciliation_v1("
    );

  assert.ok(
    start >= 0
  );

  const end =
    source.indexOf(
      "\n$$;",
      start
    );

  assert.ok(
    end > start
  );

  return source.slice(
    start,
    end + 4
  );
}


test(
  "migration mirrors remain byte identical",
  () => {
    assert.equal(
      hash(DB),
      hash(SB)
    );
  }
);


test(
  "caller cannot supply customer or financial amount authority",
  () => {
    const body =
      rpcBody();

    const signature =
      body.slice(
        0,
        body.indexOf(
          "returns table"
        )
      );

    for (
      const forbidden
      of [
        "p_user_id",
        "p_customer_user_id",
        "p_amount",
        "p_difference_amount",
        "p_expected_amount",
        "p_actual_amount",
        "p_wallet_transaction_id",
        "p_pos_id",
        "p_pos_parent",
      ]
    ) {
      assert.doesNotMatch(
        signature,
        new RegExp(
          forbidden
        )
      );
    }
  }
);


test(
  "resolution request is serialized and replay fenced",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /pg_advisory_xact_lock/
    );

    assert.match(
      body,
      /wallet_pos_reconciliation_resolution:/
    );

    assert.match(
      body,
      /where r\.request_id[\s\S]*p_request_id/
    );

    assert.match(
      body,
      /CING_WALLET_POS_RESOLUTION_REPLAY_CONFLICT/
    );
  }
);


test(
  "alert and linked session are locked",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /cing_wallet_pos_reconciliation_alerts[\s\S]*for update/
    );

    assert.match(
      body,
      /cing_wallet_pos_sessions[\s\S]*for update/
    );
  }
);


test(
  "canonical payment intent owns customer identity",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /cing_wallet_pos_payment_intents/
    );

    assert.match(
      body,
      /v_intent\.customer_user_id/
    );

    assert.match(
      body,
      /v_intent\.wallet_transaction_id/
    );

    assert.match(
      body,
      /v_intent\.status[\s\S]*'paid'/
    );

    assert.match(
      body,
      /CING_WALLET_POS_RESOLUTION_PAID_PROOF_REQUIRED/
    );
  }
);


test(
  "financial compensation is amount mismatch only",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /v_alert\.alert_type[\s\S]*'amount_mismatch'/
    );

    assert.match(
      body,
      /CING_WALLET_POS_RESOLUTION_FINANCIAL_ALERT_TYPE_INVALID/
    );
  }
);


test(
  "debit requires positive difference",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /v_action[\s\S]*'compensating_debit'[\s\S]*v_alert\.difference_amount <= 0/
    );
  }
);


test(
  "credit requires negative difference",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /v_action[\s\S]*'compensating_credit'[\s\S]*v_alert\.difference_amount >= 0/
    );
  }
);


test(
  "compensation amount is derived internally",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /v_compensation_amount[\s\S]*abs\([\s\S]*v_alert\.difference_amount/
    );

    assert.match(
      body,
      /v_signed_amount[\s\S]*compensating_credit[\s\S]*v_compensation_amount[\s\S]*-v_compensation_amount/
    );
  }
);


test(
  "financial correction uses canonical Wallet mutation primitive",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /cing_wallet_apply_mutation_private/
    );

    assert.match(
      body,
      /p_transaction_type[\s\S]*'admin_adjustment'/
    );

    assert.match(
      body,
      /p_reference_type[\s\S]*'pos_reconciliation_alert'/
    );

    assert.match(
      body,
      /p_reference_id[\s\S]*v_alert\.id::text/
    );

    assert.match(
      body,
      /p_actor_type[\s\S]*'admin'/
    );
  }
);


test(
  "original payment and original Wallet ledger are never updated",
  () => {
    const body =
      rpcBody();

    assert.doesNotMatch(
      body,
      /update\s+public\.cing_wallet_pos_payment_intents/i
    );

    assert.doesNotMatch(
      body,
      /update\s+public\.cing_wallet_transactions/i
    );

    assert.doesNotMatch(
      body,
      /delete\s+from\s+public\.cing_wallet_transactions/i
    );
  }
);


test(
  "resolution history is inserted append only",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /\binsert\s+into\s+(?:public\.)?cing_wallet_pos_reconciliation_resolutions\b/i
    );

    assert.doesNotMatch(
      body,
      /\bupdate\s+(?:public\.)?cing_wallet_pos_reconciliation_resolutions\b/i
    );

    assert.doesNotMatch(
      body,
      /\bdelete\s+from\s+(?:public\.)?cing_wallet_pos_reconciliation_resolutions\b/i
    );

    const resolutionInsertCount =
      (
        body.match(
          /\binsert\s+into\s+(?:public\.)?cing_wallet_pos_reconciliation_resolutions\b/gi
        ) || []
      ).length;

    assert.equal(
      resolutionInsertCount,
      1
    );
  }
);


test(
  "manual review leaves alert open",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /if v_action =[\s\S]*'manual_review'[\s\S]*v_alert_status[\s\S]*'open'/
    );
  }
);


test(
  "other explicit decisions resolve alert only",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /update[\s\S]*cing_wallet_pos_reconciliation_alerts[\s\S]*status =[\s\S]*'resolved'/
    );

    assert.match(
      body,
      /resolved_by[\s\S]*v_actor_id/
    );
  }
);


test(
  "resolution audit is appended",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /cing_wallet_pos_session_audit/
    );

    assert.match(
      body,
      /RECONCILIATION_RESOLUTION/
    );

    assert.match(
      body,
      /resolution_request:/
    );
  }
);


test(
  "RPC is service-role only",
  () => {
    assert.match(
      source,
      /revoke all on function[\s\S]*cing_wallet_resolve_pos_reconciliation_v1[\s\S]*from public, anon, authenticated/
    );

    assert.match(
      source,
      /grant execute on function[\s\S]*cing_wallet_resolve_pos_reconciliation_v1[\s\S]*to service_role/
    );
  }
);
