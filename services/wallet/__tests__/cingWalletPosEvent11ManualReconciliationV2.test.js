"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const test =
  require("node:test");


const service =
  fs.readFileSync(
    "services/wallet/cingWalletPosSessionService.js",
    "utf8"
  );

const db =
  fs.readFileSync(
    "db/migrations/20260914_cing_wallet_pos_event11_manual_reconciliation_v2.sql",
    "utf8"
  );

const mirror =
  fs.readFileSync(
    "supabase/migrations/20260914033000_cing_wallet_pos_event11_manual_reconciliation_v2.sql",
    "utf8"
  );


test(
  "A6 migration mirrors remain byte-identical",
  () => {
    assert.equal(
      db,
      mirror
    );
  }
);


test(
  "Event 11 parser has no first-payment fallback",
  () => {
    const start =
      service.indexOf(
        "function extractEvent11Data"
      );

    const end =
      service.indexOf(
        "\nasync function reconcileIposEvent11",
        start
      );

    assert.ok(
      start >= 0 &&
      end > start
    );

    const body =
      service.slice(
        start,
        end
      );

    assert.match(
      body,
      /payments\.find/
    );

    assert.doesNotMatch(
      body,
      /payments\s*\[\s*0\s*\]/
    );

    assert.doesNotMatch(
      body,
      /method\.includes/
    );
  }
);


test(
  "Event 11 parser canonicalizes genuine tender to CING_WALLET only",
  () => {
    const start =
      service.indexOf(
        "function extractEvent11Data"
      );

    const end =
      service.indexOf(
        "\nasync function reconcileIposEvent11",
        start
      );

    const body =
      service.slice(
        start,
        end
      );

    assert.match(
      body,
      /method ===[\s\S]*"CING_WALLET"/
    );

    assert.match(
      body,
      /method ===[\s\S]*"CING WALLET"/
    );

    assert.match(
      body,
      /walletPayment[\s\S]*\?\s*"CING_WALLET"\s*:\s*null/
    );
  }
);


test(
  "backend Event 11 service uses reconciliation V2",
  () => {
    const start =
      service.indexOf(
        "async function reconcileIposEvent11"
      );

    const end =
      service.indexOf(
        "\nasync function ",
        start + 30
      );

    const body =
      service.slice(
        start,
        end
      );

    assert.match(
      body,
      /cing_wallet_reconcile_pos_event11_v2/
    );

    assert.doesNotMatch(
      body,
      /cing_wallet_reconcile_pos_event11_v1/
    );
  }
);


test(
  "non-CING_WALLET tender is ignored before any session selection",
  () => {
    const methodFence =
      db.indexOf(
        "if v_payment_method <>"
      );

    const exactLookup =
      db.indexOf(
        "select s.*",
        methodFence
      );

    assert.ok(
      methodFence >= 0
    );

    assert.ok(
      exactLookup > methodFence
    );

    const beforeLookup =
      db.slice(
        methodFence,
        exactLookup
      );

    assert.match(
      beforeLookup,
      /ignored_non_cing_wallet/
    );

    assert.match(
      beforeLookup,
      /return/
    );
  }
);


test(
  "V2 first preserves exact already-bound sale identity",
  () => {
    assert.match(
      db,
      /where s\.pos_parent =[\s\S]*v_pos_parent[\s\S]*and s\.pos_id =[\s\S]*v_pos_id[\s\S]*and s\.sale_tran_id =[\s\S]*v_sale_tran_id/
    );
  }
);


test(
  "manual first Event 11 binds only a paid same-POS pre-bill session",
  () => {
    assert.match(
      db,
      /s\.session_origin in \([\s\S]*'cashier_manual'[\s\S]*'ipos_api'/
    );

    assert.match(
      db,
      /s\.sale_tran_id is null/
    );

    assert.match(
      db,
      /i\.status =[\s\S]*'paid'/
    );

    assert.match(
      db,
      /i\.wallet_transaction_id[\s\S]*is not null/
    );

    assert.match(
      db,
      /i\.paid_at[\s\S]*is not null/
    );
  }
);


test(
  "manual Event 11 matching fails closed if candidate is ambiguous",
  () => {
    assert.match(
      db,
      /v_candidate_count > 1/
    );

    assert.match(
      db,
      /CING_WALLET_POS_EVENT11_MANUAL_SESSION_AMBIGUOUS/
    );
  }
);


test(
  "sale_tran_id is bound exactly from Event 11 and only when NULL",
  () => {
    assert.match(
      db,
      /sale_tran_id =[\s\S]*v_sale_tran_id/
    );

    assert.match(
      db,
      /and sale_tran_id[\s\S]*is null/
    );

    assert.match(
      db,
      /EVENT11_IDENTITY_BOUND/
    );
  }
);


test(
  "amount remains immutable and mismatch becomes durable alert",
  () => {
    assert.match(
      db,
      /v_session\.amount[\s\S]*is distinct from[\s\S]*p_final_total/
    );

    assert.match(
      db,
      /amount_mismatch/
    );

    assert.match(
      db,
      /cing_wallet_pos_reconciliation_alerts/
    );

    assert.doesNotMatch(
      db,
      /set[\s\S]{0,120}amount\s*=\s*p_final_total/i
    );
  }
);


test(
  "Event 11 V2 has zero Wallet financial mutation authority",
  () => {
    for (
      const forbidden of [
        "cing_wallet_settle_pos_payment_atomic_v1",
        "cing_wallet_apply_mutation_private",
        "wallet_debit",
        "wallet_credit",
        "refund",
        "updateMemberPoint",
      ]
    ) {
      assert.equal(
        db.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);


test(
  "Event 11 V2 remains service-role only",
  () => {
    assert.match(
      db,
      /revoke all on function[\s\S]*cing_wallet_reconcile_pos_event11_v2[\s\S]*from public, anon, authenticated/
    );

    assert.match(
      db,
      /grant execute on function[\s\S]*cing_wallet_reconcile_pos_event11_v2[\s\S]*to service_role/
    );
  }
);


test(
  "paid projection remains independent from Event 11 V2",
  () => {
    const paidStart =
      service.indexOf(
        "async function projectPaidPaymentToPosSession"
      );

    const paidEnd =
      service.indexOf(
        "\nasync function reconcileIposEvent11",
        paidStart
      );

    const paid =
      service.slice(
        paidStart,
        paidEnd
      );

    assert.match(
      paid,
      /cing_wallet_project_pos_session_paid_v1/
    );

    assert.doesNotMatch(
      paid,
      /event11|sale_tran_id/i
    );
  }
);
