"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const orchestrator =
  fs.readFileSync(
    "services/payment/paymentOrchestratorService.js",
    "utf8"
  );

const adapter =
  fs.readFileSync(
    "services/payment/commercePointReservationService.js",
    "utf8"
  );

test(
  "reservation adapter sends payment identity only to PostgreSQL",
  () => {
    assert.match(
      adapter,
      /cing_commerce_reserve_payment_points_v1/
    );

    assert.match(
      adapter,
      /p_payment_transaction_id/
    );

    assert.doesNotMatch(
      adapter,
      /p_user_id|p_points|p_amount/
    );
  }
);

test(
  "durable payment transaction exists before reservation",
  () => {
    const tx =
      orchestrator.indexOf(
        "await createTransaction({"
      );

    const reserve =
      orchestrator.indexOf(
        "await reservePaymentPoints({"
      );

    assert.ok(tx >= 0);
    assert.ok(reserve > tx);
  }
);

test(
  "reservation happens before Wallet or provider rail",
  () => {
    const reserve =
      orchestrator.indexOf(
        "await reservePaymentPoints({"
      );

    const wallet =
      orchestrator.indexOf(
        'payload.payment_method ==='
      );

    const provider =
      orchestrator.indexOf(
        "await provider.createPayment({"
      );

    assert.ok(reserve >= 0);
    assert.ok(wallet > reserve);
    assert.ok(provider > reserve);
  }
);

test(
  "wallet cannot bypass point reservation",
  () => {
    assert.match(
      orchestrator,
      /const pointReservation[\s\S]*reservePaymentPoints[\s\S]*payment_method[\s\S]*cing_wallet/
    );
  }
);

test(
  "external provider cannot be created before reservation",
  () => {
    assert.match(
      orchestrator,
      /reservePaymentPoints[\s\S]*provider\.createPayment/
    );
  }
);

test(
  "wallet topup does not reserve commerce points",
  () => {
    assert.match(
      orchestrator,
      /paymentPurpose === "order"[\s\S]*reservePaymentPoints/
    );
  }
);

test(
  "both payment return contracts expose reservation proof",
  () => {
    const occurrences =
      (
        orchestrator.match(
          /^\s*pointReservation,\s*$/gm
        ) || []
      ).length;

    assert.ok(
      occurrences >= 2
    );
  }
);

test(
  "orchestrator never eagerly releases held points",
  () => {
    assert.doesNotMatch(
      orchestrator,
      /releasePaymentPoints|cing_commerce_release_payment_points_v1/
    );
  }
);
