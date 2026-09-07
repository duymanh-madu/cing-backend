"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

function read(file) {
  return fs.readFileSync(
    file,
    "utf8"
  );
}

const checkout =
  read(
    "routes/checkoutRoutes.js"
  );

const orchestrator =
  read(
    "services/payment/paymentOrchestratorService.js"
  );

const registry =
  read(
    "services/payment/paymentProviderRegistry.js"
  );

test(
  "canonical checkout uses payment orchestrator",
  () => {
    assert.match(
      checkout,
      /\.\.\/services\/payment\/paymentOrchestratorService/
    );

    assert.doesNotMatch(
      checkout,
      /\.\.\/services\/paymentService/
    );
  }
);

test(
  "orchestrator preserves cart snapshot input",
  () => {
    assert.match(
      orchestrator,
      /cart_snapshot/
    );
  }
);

test(
  "orchestrator delegates payment creation to provider",
  () => {
    assert.match(
      orchestrator,
      /provider\.createPayment/
    );
  }
);

test(
  "Zalo Checkout provider is registered",
  () => {
    assert.match(
      registry,
      /\bzalo_checkout\s*:/
    );
  }
);

test(
  "Zalo Checkout raw provider payload is exposed as zaloOrder",
  () => {
    assert.match(
      orchestrator,
      /zaloOrder\s*:[\s\S]*providerResult\.raw/
    );
  }
);

test(
  "Wallet settlement remains after payment transaction creation",
  () => {

    const checkoutSource =
      require("node:fs")
        .readFileSync(
          "routes/checkoutRoutes.js",
          "utf8"
        );

    /*
     * Full-points checkout is canonicalized to points/internal
     * before rail execution. Wallet therefore consumes the
     * canonical tender rather than raw client payment_method.
     */
    assert.match(
      checkoutSource,
      /canonicalPaymentMethod\s*===[\s\S]*"cing_wallet"[\s\S]*paymentResult\?\.payment\?\.id[\s\S]*settleWalletOrderPayment/
    );

  }
);
