"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");


const ROOT =
  path.resolve(
    __dirname,
    "../../.."
  );


function read(
  relative
) {
  return fs
    .readFileSync(
      path.join(
        ROOT,
        relative
      ),
      "utf8"
    );
}


const migration =
  read(
    "db/migrations/20260913_cing_wallet_pos_reconciliation_authority_v1.sql"
  );

const mirror =
  read(
    "supabase/migrations/20260913184500_cing_wallet_pos_reconciliation_authority_v1.sql"
  );

const sessionService =
  read(
    "services/wallet/cingWalletPosSessionService.js"
  );

const walletRoutes =
  read(
    "routes/walletRoutes.js"
  );

const iposWebhook =
  read(
    "routes/iposWebhookRoutes.js"
  );

const adminRoute =
  read(
    "routes/adminWalletPosRoutes.js"
  );


test(
  "V1C migration mirrors are byte-identical",
  () => {
    assert.equal(
      migration,
      mirror
    );
  }
);


test(
  "paid projection verifies canonical already-paid payment intent",
  () => {
    assert.match(
      migration,
      /cing_wallet_project_pos_session_paid_v1/
    );

    assert.match(
      migration,
      /v_intent\.status\s*<>\s*'paid'/
    );

    assert.match(
      migration,
      /v_intent\.wallet_transaction_id is null/
    );

    assert.match(
      migration,
      /WALLET_SETTLED/
    );
  }
);


test(
  "legacy payment intents without POS session do not turn successful payment into failure",
  () => {
    assert.match(
      migration,
      /if not found then[\s\S]*false,[\s\S]*null::uuid/
    );

    assert.match(
      walletRoutes,
      /try\s*\{[\s\S]*projectPaidPaymentToPosSession[\s\S]*catch/
    );

    assert.match(
      walletRoutes,
      /Paid projection failed after committed settlement/
    );
  }
);


test(
  "Event 11 reconciliation uses canonical POS bill identity",
  () => {
    assert.match(
      migration,
      /s\.pos_parent\s*=\s*v_pos_parent[\s\S]*s\.pos_id\s*=\s*v_pos_id[\s\S]*s\.sale_tran_id\s*=\s*v_sale_tran_id/
    );

    assert.match(
      sessionService,
      /sale\.tran_id/
    );

    assert.match(
      sessionService,
      /sale\.total_amount/
    );
  }
);


test(
  "Event 11 can repair stale POS session state from canonical paid intent",
  () => {
    assert.match(
      migration,
      /PAID_STATE_AUTO_REPAIRED/
    );

    assert.match(
      migration,
      /v_intent\.status = 'paid'[\s\S]*wallet_transaction_id is not null[\s\S]*status\s*=\s*'reconciliation_pending'/
    );

    assert.match(
      migration,
      /v_state_repaired :=\s*true/
    );
  }
);


test(
  "matching Event 11 only reconciles state and resolves alerts",
  () => {
    assert.match(
      migration,
      /v_status :=\s*'matched'/
    );

    assert.match(
      migration,
      /status =\s*'resolved'[\s\S]*system:event11_match/
    );

    assert.match(
      migration,
      /EVENT11_RECONCILED/
    );
  }
);


test(
  "amount mismatch creates durable critical Super Admin alert",
  () => {
    assert.match(
      migration,
      /'amount_mismatch'/
    );

    assert.match(
      migration,
      /cing_wallet_pos_reconciliation_alerts/
    );

    assert.match(
      migration,
      /when v_alert_type =\s*'amount_mismatch'[\s\S]*then 'critical'/
    );

    assert.match(
      migration,
      /difference_amount/
    );
  }
);


test(
  "payment-not-settled final bill creates durable alert",
  () => {
    assert.match(
      migration,
      /payment_not_settled/
    );

    assert.match(
      migration,
      /v_intent\.status <> 'paid'/
    );
  }
);


test(
  "reconciliation never performs Wallet debit credit or refund",
  () => {
    assert.doesNotMatch(
      migration,
      /cing_wallet_apply_mutation_private\s*\(/
    );

    assert.doesNotMatch(
      migration,
      /update\s+public\.cing_wallet_accounts/i
    );

    assert.doesNotMatch(
      migration,
      /insert\s+into\s+public\.cing_wallet_transactions/i
    );
  }
);


test(
  "Event 11 lane executes before legacy Redis dedup and member phone guard",
  () => {
    const lane =
      iposWebhook.indexOf(
        "CING WALLET POS EVENT 11 RECONCILIATION LANE"
      );

    const dedup =
      iposWebhook.indexOf(
        "Idempotency check"
      );

    const phoneGuard =
      iposWebhook.indexOf(
        "if (!phone) return;"
      );

    assert.ok(
      lane >= 0
    );

    assert.ok(
      dedup >
      lane
    );

    assert.ok(
      phoneGuard >
      lane
    );
  }
);


test(
  "customer settlement publishes paid transition to counter",
  () => {
    assert.match(
      sessionService,
      /wallet\.pos\.payment\.paid/
    );

    assert.match(
      sessionService,
      /projectPaidPaymentToPosSession/
    );
  }
);


test(
  "Event 11 publishes matched or alert realtime transition",
  () => {
    assert.match(
      sessionService,
      /wallet\.pos\.reconciliation\.matched/
    );

    assert.match(
      sessionService,
      /wallet\.pos\.reconciliation\.alert/
    );
  }
);


test(
  "Super Admin counter boundary exposes durable alert list",
  () => {
    assert.match(
      adminRoute,
      /\/reconciliation-alerts/
    );

    assert.match(
      adminRoute,
      /listPosReconciliationAlerts/
    );

    assert.match(
      adminRoute,
      /wallet\.pos\.operate/
    );
  }
);
