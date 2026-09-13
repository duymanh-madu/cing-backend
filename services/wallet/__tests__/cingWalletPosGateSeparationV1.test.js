"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const test =
  require("node:test");

function extractFunction(
  source,
  signature
) {
  const start =
    source.indexOf(
      signature
    );

  assert.notEqual(
    start,
    -1,
    `missing ${signature}`
  );

  const candidates = [
    source.indexOf(
      "\nasync function ",
      start + signature.length
    ),
    source.indexOf(
      "\nfunction ",
      start + signature.length
    ),
  ].filter(
    value =>
      value >= 0
  );

  const end =
    candidates.length
      ? Math.min(...candidates)
      : source.length;

  return source.slice(
    start,
    end
  );
}

const paymentSource =
  fs.readFileSync(
    "services/wallet/cingWalletPosPaymentService.js",
    "utf8"
  );

const sessionSource =
  fs.readFileSync(
    "services/wallet/cingWalletPosSessionService.js",
    "utf8"
  );

test(
  "createIposPosPayment owns the e-payment gate before financial RPC",
  () => {
    const body =
      extractFunction(
        paymentSource,
        "async function createIposPosPayment("
      );

    const gate =
      body.indexOf(
        "assertPosEpaymentEnabled();"
      );

    const rpc =
      body.indexOf(
        "cing_wallet_create_pos_payment_intent_v1"
      );

    assert.ok(
      gate >= 0
    );

    assert.ok(
      rpc >= 0
    );

    assert.ok(
      gate < rpc
    );
  }
);

test(
  "freezeAmountAndCreateQr blocks before amount freeze while e-payment is disabled",
  () => {
    const body =
      extractFunction(
        sessionSource,
        "async function freezeAmountAndCreateQr("
      );

    const counter =
      body.indexOf(
        "assertPosCounterEnabled();"
      );

    const epayment =
      body.indexOf(
        "assertPosEpaymentEnabled();"
      );

    const freezeRpc =
      body.indexOf(
        "cing_wallet_freeze_pos_session_amount_v1"
      );

    const create =
      body.indexOf(
        "createIposPosPayment("
      );

    assert.ok(
      counter >= 0
    );

    assert.ok(
      epayment > counter
    );

    assert.ok(
      freezeRpc > epayment
    );

    assert.ok(
      create > freezeRpc
    );
  }
);

test(
  "QR recovery is unavailable while e-payment is disabled",
  () => {
    const body =
      extractFunction(
        sessionSource,
        "async function recoverPosSessionQr("
      );

    const counter =
      body.indexOf(
        "assertPosCounterEnabled();"
      );

    const epayment =
      body.indexOf(
        "assertPosEpaymentEnabled();"
      );

    const capability =
      body.indexOf(
        "createQrCapability("
      );

    assert.ok(
      counter >= 0
    );

    assert.ok(
      epayment > counter
    );

    assert.ok(
      capability < 0 ||
      capability > epayment
    );
  }
);

test(
  "Event 2 discovery remains independent of e-payment gate",
  () => {
    const body =
      extractFunction(
        sessionSource,
        "async function handleIposUsingVoucher("
      );

    assert.ok(
      body.includes(
        "assertPosCounterEnabled();"
      )
    );

    assert.equal(
      body.includes(
        "assertPosEpaymentEnabled();"
      ),
      false
    );

    assert.ok(
      body.includes(
        "cing_wallet_upsert_pos_session_from_event2_v1"
      )
    );

    assert.equal(
      body.includes(
        "createIposPosPayment("
      ),
      false
    );

    assert.equal(
      body.includes(
        "confirmCustomerPosPayment"
      ),
      false
    );
  }
);
