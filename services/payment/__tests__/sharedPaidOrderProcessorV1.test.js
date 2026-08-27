const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const route =
  fs.readFileSync(
    "routes/paymentWebhookRoutes.js",
    "utf8"
  );

const processor =
  fs.readFileSync(
    "services/payment/paidOrderSettlementProcessor.js",
    "utf8"
  );

test(
  "paid order business pipeline is extracted into a shared processor",
  () => {
    assert.match(
      route,
      /require\("\.\.\/services\/payment\/paidOrderSettlementProcessor"\)/
    );

    assert.match(
      route,
      /await processPaidOrderSettlement\(\{[\s\S]*req,[\s\S]*orderId,[\s\S]*transId,[\s\S]*amount,[\s\S]*\}\)/
    );

    assert.doesNotMatch(
      route,
      /async function processPaidOrderSettlement\(/
    );

    assert.match(
      processor,
      /async function processPaidOrderSettlement\(\{[\s\S]*req,[\s\S]*orderId,[\s\S]*transId,[\s\S]*amount,[\s\S]*\}\)/
    );

    assert.match(
      processor,
      /from\("orders"\)[\s\S]*pushOrderToIPOS[\s\S]*runGamePlaysEffectBestEffort/
    );
  }
);

test(
  "shared processor preserves critical order side effects",
  () => {
    const required = [
      'payment.success',
      'pushOrderToIPOS',
      'checkOrderMissions',
      'updatePartnerMonthlySpending',
      'runGamePlaysEffectBestEffort',
      'deductPoints',
      'addPoints',
      'leaderboard.updated',
    ];

    for (const token of required) {
      assert.match(
        processor,
        new RegExp(
          token.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )
        )
      );
    }
  }
);

test(
  "normalized payment result preserves failed-payment transition",
  () => {
    assert.match(
      route,
      /async function processNormalizedPaymentResult[\s\S]*resultCode !== 0[\s\S]*payment_status:[\s\S]*"failed"[\s\S]*failure_reason/
    );
  }
);

test(
  "MoMo entry delegates successful normalized results to shared processing",
  () => {
    const momoStart =
      route.indexOf(
        "const momoIpnHandler"
      );

    const zaloStart =
      route.indexOf(
        "async function processZaloCheckoutAsPaid"
      );

    assert.ok(
      momoStart >= 0 &&
      zaloStart > momoStart
    );

    const momoSection =
      route.slice(
        momoStart,
        zaloStart
      );

    assert.match(
      momoSection,
      /await processNormalizedPaymentResult\(\{[\s\S]*resultCode:[\s\S]*0/
    );
  }
);

test(
  "Zalo entry delegates directly to normalized processor",
  () => {
    assert.match(
      route,
      /processZaloCheckoutAsPaid[\s\S]*await processNormalizedPaymentResult\(\{[\s\S]*resultCode:[\s\S]*resultCode === 1[\s\S]*\? 0[\s\S]*: -1/
    );

    assert.doesNotMatch(
      route,
      /fakeReq|fakeRes/
    );

    assert.doesNotMatch(
      route,
      /momoIpnHandler\(fake/
    );
  }
);

test(
  "provider verification remains outside the shared paid-order processor",
  () => {
    assert.match(
      route,
      /verifyMomoSettlement\(/
    );

    assert.match(
      route,
      /async function processNormalizedPaymentResult/
    );

    assert.doesNotMatch(
      processor,
      /verifyMomoSettlement\(/
    );

    assert.doesNotMatch(
      processor,
      /settlement_verified_at/
    );
  }
);
