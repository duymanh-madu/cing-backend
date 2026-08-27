"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const processor =
  fs.readFileSync(
    "services/payment/paidOrderSettlementProcessor.js",
    "utf8"
  );

const walletService =
  fs.readFileSync(
    "services/wallet/cingWalletOrderPaymentService.js",
    "utf8"
  );


test(
  "paid-order processor resolves durable order replay before Redis",
  () => {
    const replay =
      processor.indexOf(
        "findDurableOrderForPayment"
      );

    const lock =
      processor.indexOf(
        '"commerce:paid-order:"'
      );

    assert.ok(
      replay >= 0 &&
      lock > replay
    );

    assert.match(
      processor,
      /return buildCompletionResult\(\{[\s\S]*replayed:\s*true/
    );
  }
);


test(
  "payment order_created flag alone is never accepted as completion",
  () => {
    assert.doesNotMatch(
      processor,
      /if \(payment\.order_created === true\)/
    );

    assert.match(
      processor,
      /order\.payment_transaction_id[\s\S]*payment\.id/
    );
  }
);


test(
  "Redis is contention optimization and lock conflict cannot false-succeed",
  () => {
    assert.match(
      processor,
      /COMMERCE_COMPLETION_IN_PROGRESS/
    );

    assert.doesNotMatch(
      processor,
      /Lock exists, skip duplicate/
    );

    assert.match(
      processor,
      /finally[\s\S]*redisClient[\s\S]*\.del\(lockKey\)/
    );
  }
);


test(
  "pre-order completion failures propagate instead of returning undefined",
  () => {
    const required = [
      "COMMERCE_PAYMENT_NOT_FOUND",
      "COMMERCE_ORDER_CART_EMPTY",
      "COMMERCE_ORDER_CREATE_FAILED",
      "COMMERCE_COMPLETION_PAYMENT_PROJECTION_FAILED",
    ];

    for (const token of required) {
      assert.match(
        processor,
        new RegExp(token)
      );
    }

    assert.match(
      processor,
      /catch \(err\)[\s\S]*throw err/
    );
  }
);


test(
  "unique insert race converges on existing durable order",
  () => {
    assert.match(
      processor,
      /orderErr\.code[\s\S]*23505[\s\S]*findDurableOrderForPayment[\s\S]*buildCompletionResult/
    );
  }
);


test(
  "durable completion returns explicit bounded result",
  () => {
    assert.match(
      processor,
      /success:\s*true[\s\S]*completed:\s*true[\s\S]*payment_transaction_id:[\s\S]*order_id:[\s\S]*order_code:/
    );
  }
);


test(
  "internal Wallet settlement proof is not rewritten as provider webhook proof",
  () => {
    assert.match(
      processor,
      /isInternalWallet[\s\S]*payment\.payment_method[\s\S]*"cing_wallet"[\s\S]*if \(!isInternalWallet\)[\s\S]*webhook_verified/
    );
  }
);


test(
  "iPOS handoff preserves actual payment tender",
  () => {
    assert.match(
      processor,
      /payment_method:[\s\S]*order\.payment_method[\s\S]*payment\.payment_method/
    );

    assert.match(
      processor,
      /momo_trans_id:[\s\S]*payment\.payment_method[\s\S]*"momo"[\s\S]*String/
    );

    assert.doesNotMatch(
      processor,
      /payment_method:\s*"momo",/
    );
  }
);


test(
  "Wallet service succeeds only after explicit durable commerce completion",
  () => {
    assert.match(
      walletService,
      /const commerceCompletion =[\s\S]*await processPaidOrderSettlement/
    );

    assert.match(
      walletService,
      /commerceCompletion\?\.completed[\s\S]*true/
    );

    assert.match(
      walletService,
      /CING_WALLET_ORDER_COMMERCE_COMPLETION_REQUIRED/
    );

    assert.match(
      walletService,
      /completed:\s*true[\s\S]*order_id:[\s\S]*commerceCompletion\.order_id/
    );
  }
);
