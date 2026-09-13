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
  return fs.readFileSync(
    path.join(
      ROOT,
      relative
    ),
    "utf8"
  );
}


const sessionService =
  read(
    "services/wallet/cingWalletPosSessionService.js"
  );

const posRoute =
  read(
    "routes/adminWalletPosRoutes.js"
  );

const walletRead =
  read(
    "services/wallet/cingWalletReadService.js"
  );


test(
  "QR recovery uses existing payment token identity and frozen expiry",
  () => {
    assert.match(
      sessionService,
      /recoverPosSessionQr/
    );

    assert.match(
      sessionService,
      /payment_token_id/
    );

    assert.match(
      sessionService,
      /createQrCapability\(\{[\s\S]*paymentTokenId:[\s\S]*intent\.payment_token_id[\s\S]*expiresAt:[\s\S]*intent\.expires_at/
    );
  }
);


test(
  "QR recovery never creates another payment intent",
  () => {
    const start =
      sessionService.indexOf(
        "async function recoverPosSessionQr"
      );

    const end =
      sessionService.indexOf(
        "async function listPosSessions",
        start
      );

    const recovery =
      sessionService.slice(
        start,
        end
      );

    assert.doesNotMatch(
      recovery,
      /createIposPosPayment\s*\(/
    );

    assert.doesNotMatch(
      recovery,
      /cing_wallet_create_pos_payment_intent/
    );
  }
);


test(
  "QR recovery refuses expired and non-pending intent",
  () => {
    assert.match(
      sessionService,
      /intent\.status !==[\s\S]*"pending"/
    );

    assert.match(
      sessionService,
      /expiresAtMs <=[\s\S]*Date\.now\(\)/
    );

    assert.match(
      sessionService,
      /statusCode:[\s\S]*410/
    );
  }
);


test(
  "QR recovery validates bill amount and POS identity",
  () => {
    assert.match(
      sessionService,
      /intent\.pos_parent !==[\s\S]*session\.pos_parent/
    );

    assert.match(
      sessionService,
      /intent\.pos_id !==[\s\S]*session\.pos_id/
    );

    assert.match(
      sessionService,
      /intent\.bill_reference !==[\s\S]*session\.sale_tran_id/
    );

    assert.match(
      sessionService,
      /Number\([\s\S]*intent\.amount[\s\S]*Number\([\s\S]*session\.amount/
    );
  }
);


test(
  "Counter exposes bounded QR recovery endpoint",
  () => {
    assert.match(
      posRoute,
      /\/sessions\/:sessionId\/qr/
    );

    assert.match(
      posRoute,
      /recoverPosSessionQr/
    );

    assert.match(
      posRoute,
      /wallet\.pos\.operate/
    );
  }
);


test(
  "Wallet statement query reads ledger metadata only for read projection",
  () => {
    assert.match(
      walletRead,
      /"metadata"/
    );

    assert.match(
      walletRead,
      /resolveCustomerSafePosPaymentMetadata/
    );

    assert.match(
      walletRead,
      /reference_type !==[\s\S]*"pos_payment_intent"/
    );
  }
);


test(
  "customer history exposes only safe POS fields",
  () => {
    assert.match(
      walletRead,
      /bill_reference:/
    );

    assert.match(
      walletRead,
      /pos_parent:/
    );

    assert.match(
      walletRead,
      /pos_id:/
    );

    assert.doesNotMatch(
      walletRead,
      /pos_payment:[\s\S]{0,300}payment_token_id/
    );

    assert.doesNotMatch(
      walletRead,
      /pos_payment:[\s\S]{0,300}provider_request_key/
    );
  }
);


test(
  "V1D-B backend performs no Wallet money mutation",
  () => {
    const combined =
      sessionService +
      "\n" +
      walletRead +
      "\n" +
      posRoute;

    assert.doesNotMatch(
      combined,
      /cing_wallet_apply_mutation_private\s*\(/
    );

    assert.doesNotMatch(
      combined,
      /update\s+public\.cing_wallet_accounts/i
    );
  }
);
