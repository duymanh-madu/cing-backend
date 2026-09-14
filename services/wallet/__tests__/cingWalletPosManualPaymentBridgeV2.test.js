"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const test =
  require("node:test");


const db =
  fs.readFileSync(
    "db/migrations/20260914_cing_wallet_pos_manual_payment_bridge_v2.sql",
    "utf8"
  );

const mirror =
  fs.readFileSync(
    "supabase/migrations/20260914023000_cing_wallet_pos_manual_payment_bridge_v2.sql",
    "utf8"
  );

const service =
  fs.readFileSync(
    "services/wallet/cingWalletPosSessionService.js",
    "utf8"
  );


test(
  "A3 DB and Supabase migrations remain byte-identical",
  () => {
    assert.equal(
      db,
      mirror
    );
  }
);


test(
  "manual payment prepare is one orchestration RPC",
  () => {
    assert.match(
      db,
      /public\.cing_wallet_prepare_manual_pos_payment_v2/
    );

    assert.match(
      db,
      /cing_wallet_create_manual_pos_session_v2/
    );

    assert.match(
      db,
      /cing_wallet_create_pos_payment_intent_v1/
    );

    assert.match(
      db,
      /cing_wallet_link_pos_session_payment_intent_v1/
    );
  }
);


test(
  "session UUID is used as pre-bill provider identity",
  () => {
    assert.match(
      db,
      /':session:'[\s\S]*v_session\.session_id::text/
    );
  }
);


test(
  "manual payment intent keeps bill_reference NULL before Event 11",
  () => {
    assert.match(
      db,
      /cing_wallet_create_pos_payment_intent_v1\([\s\S]*v_provider_request_key[\s\S]*v_session\.pos_parent[\s\S]*v_session\.pos_id[\s\S]*null,[\s\S]*v_session\.amount/
    );
  }
);


test(
  "manual payment metadata never pretends session UUID is an iPOS transaction",
  () => {
    assert.match(
      db,
      /'payment_origin',[\s\S]*'manual_pos_counter'/
    );

    assert.match(
      db,
      /'pos_session_id'/
    );

    assert.doesNotMatch(
      db,
      /'ipos_transaction_id'/
    );
  }
);


test(
  "orchestration has no Wallet settlement authority",
  () => {
    for (
      const forbidden of [
        "cing_wallet_settle_pos_payment_atomic_v1",
        "wallet_debit",
        "wallet_credit",
        "refund",
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
  "manual orchestration remains backend service-role only",
  () => {
    assert.match(
      db,
      /revoke all on function[\s\S]*cing_wallet_prepare_manual_pos_payment_v2[\s\S]*from public,\s*anon,\s*authenticated/i
    );

    assert.match(
      db,
      /grant execute on function[\s\S]*cing_wallet_prepare_manual_pos_payment_v2[\s\S]*to service_role/i
    );
  }
);


test(
  "backend manual QR path calls exactly one Supabase RPC",
  () => {
    const start =
      service.indexOf(
        "async function prepareManualPosPaymentQr"
      );

    const end =
      service.indexOf(
        "\nasync function freezeAmountAndCreateQr",
        start
      );

    assert.ok(
      start >= 0
    );

    assert.ok(
      end > start
    );

    const body =
      service.slice(
        start,
        end
      );

    const rpcMatches =
      [
        ...body.matchAll(
          /\.rpc\(\s*["']([^"']+)["']/g
        ),
      ];

    assert.equal(
      rpcMatches.length,
      1
    );

    assert.equal(
      rpcMatches[0][1],
      "cing_wallet_prepare_manual_pos_payment_v3"
    );
  }
);


test(
  "backend locally signs QR from canonical token and frozen expiry",
  () => {
    const start =
      service.indexOf(
        "async function prepareManualPosPaymentQr"
      );

    const end =
      service.indexOf(
        "\nasync function freezeAmountAndCreateQr",
        start
      );

    const body =
      service.slice(
        start,
        end
      );

    assert.match(
      body,
      /createQrCapability\(\{[\s\S]*paymentTokenId:[\s\S]*payment_token_id[\s\S]*expiresAt:[\s\S]*expires_at/
    );
  }
);


test(
  "manual QR path never calls iPOS Foodbook or Event 11",
  () => {
    const start =
      service.indexOf(
        "async function prepareManualPosPaymentQr"
      );

    const end =
      service.indexOf(
        "\nasync function freezeAmountAndCreateQr",
        start
      );

    const body =
      service.slice(
        start,
        end
      );

    for (
      const forbidden of [
        "createIposPosPayment(",
        "reconcileIposEvent11(",
        "fetch(",
        "axios",
        "Foodbook",
      ]
    ) {
      assert.equal(
        body.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);


test(
  "manual pre-bill flow refuses fabricated sale_tran_id",
  () => {
    const start =
      service.indexOf(
        "async function prepareManualPosPaymentQr"
      );

    const end =
      service.indexOf(
        "\nasync function freezeAmountAndCreateQr",
        start
      );

    const body =
      service.slice(
        start,
        end
      );

    assert.match(
      body,
      /prepared\.sale_tran_id[\s\S]*null/
    );

    assert.match(
      body,
      /sale_tran_id:[\s\S]*null/
    );
  }
);


test(
  "manual path still requires both Counter and Epayment kill switches",
  () => {
    const start =
      service.indexOf(
        "async function prepareManualPosPaymentQr"
      );

    const end =
      service.indexOf(
        "\nasync function freezeAmountAndCreateQr",
        start
      );

    const body =
      service.slice(
        start,
        end
      );

    const counter =
      body.indexOf(
        "assertPosCounterEnabled()"
      );

    const epayment =
      body.indexOf(
        "assertPosEpaymentEnabled()"
      );

    const rpc =
      body.indexOf(
        ".rpc("
      );

    assert.ok(
      counter >= 0
    );

    assert.ok(
      epayment > counter
    );

    assert.ok(
      rpc > epayment
    );
  }
);
