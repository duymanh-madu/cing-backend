"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const test =
  require("node:test");

const db =
  fs.readFileSync(
    "db/migrations/20260914_cing_wallet_pos_manual_session_authority_v2.sql",
    "utf8"
  );

const mirror =
  fs.readFileSync(
    "supabase/migrations/20260914014500_cing_wallet_pos_manual_session_authority_v2.sql",
    "utf8"
  );


test(
  "DB and Supabase V2 migrations remain byte-identical",
  () => {
    assert.equal(
      db,
      mirror
    );
  }
);


test(
  "sale_tran_id becomes nullable without weakening Event 2 identity",
  () => {
    assert.match(
      db,
      /alter column\s+sale_tran_id\s+drop not null/i
    );

    assert.match(
      db,
      /session_origin\s*=\s*'event2'[\s\S]*sale_tran_id is not null/i
    );
  }
);


test(
  "manual and future iPOS API sessions have explicit origins",
  () => {
    assert.match(
      db,
      /session_origin in\s*\(\s*'event2',\s*'cashier_manual',\s*'ipos_api'\s*\)/i
    );
  }
);


test(
  "manual session request identity is durable and unique",
  () => {
    assert.match(
      db,
      /manual_request_id uuid/i
    );

    assert.match(
      db,
      /unique index[\s\S]*cing_wallet_pos_sessions_manual_request_uq[\s\S]*manual_request_id/i
    );
  }
);


test(
  "one active pre-reconciliation payment session is allowed per POS",
  () => {
    assert.match(
      db,
      /unique index[\s\S]*cing_wallet_pos_sessions_active_payment_pos_uq[\s\S]*pos_parent[\s\S]*pos_id[\s\S]*where[\s\S]*cashier_manual[\s\S]*ipos_api[\s\S]*amount_frozen[\s\S]*qr_ready[\s\S]*paid[\s\S]*reconciliation_pending/i
    );
  }
);


test(
  "manual session creation serializes concurrent attempts per POS",
  () => {
    assert.match(
      db,
      /pg_advisory_xact_lock[\s\S]*hashtextextended[\s\S]*v_pos_parent[\s\S]*v_pos_id/i
    );
  }
);


test(
  "manual session is born with an immutable frozen amount and no sale_tran_id",
  () => {
    assert.match(
      db,
      /insert into[\s\S]*cing_wallet_pos_sessions[\s\S]*sale_tran_id[\s\S]*amount[\s\S]*amount_source[\s\S]*amount_frozen_at[\s\S]*status/i
    );

    assert.match(
      db,
      /null,[\s\S]*p_amount,[\s\S]*v_amount_source,[\s\S]*v_actor_id,[\s\S]*v_now,[\s\S]*v_now,[\s\S]*'merchant_dynamic_qr'[\s\S]*null,[\s\S]*'amount_frozen'/i
    );
  }
);


test(
  "manual session creation has no Wallet mutation or payment settlement authority",
  () => {
    const start =
      db.indexOf(
        "public.cing_wallet_create_manual_pos_session_v2("
      );

    const end =
      db.indexOf(
        "revoke all on function",
        start
      );

    assert.ok(
      start >= 0
    );

    assert.ok(
      end > start
    );

    const rpc =
      db.slice(
        start,
        end
      );

    for (
      const forbidden of [
        "cing_wallet_settle_pos_payment_atomic_v1",
        "wallet_debit",
        "wallet_credit",
        "cing_wallet_transactions",
        "cing_wallet_accounts",
      ]
    ) {
      assert.equal(
        rpc.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);


test(
  "manual session creation is service-role only",
  () => {
    assert.match(
      db,
      /revoke all on function[\s\S]*cing_wallet_create_manual_pos_session_v2[\s\S]*from public,\s*anon,\s*authenticated/i
    );

    assert.match(
      db,
      /grant execute on function[\s\S]*cing_wallet_create_manual_pos_session_v2[\s\S]*to service_role/i
    );
  }
);


test(
  "mismatch resolutions have a separate append-only authority table",
  () => {
    assert.match(
      db,
      /create table if not exists\s+public\.cing_wallet_pos_reconciliation_resolutions/i
    );

    assert.match(
      db,
      /resolution_action[\s\S]*reason_code[\s\S]*actor_id[\s\S]*expected_amount[\s\S]*actual_amount[\s\S]*difference_amount[\s\S]*compensating_wallet_transaction_id/i
    );

    assert.match(
      db,
      /before update or delete[\s\S]*cing_wallet_pos_resolution_immutable_v2/i
    );
  }
);


test(
  "resolution actions explicitly model compensating outcomes without rewriting original payment",
  () => {
    for (
      const action of [
        "accept_as_is",
        "compensating_debit",
        "compensating_credit",
        "pos_correction_confirmed",
        "manual_review",
      ]
    ) {
      assert.ok(
        db.includes(
          `'${action}'`
        ),
        action
      );
    }
  }
);


test(
  "Event 2 implementation is not removed by V2 migration",
  () => {
    assert.doesNotMatch(
      db,
      /drop function[\s\S]*cing_wallet_upsert_pos_session_from_event2_v1/i
    );
  }
);
