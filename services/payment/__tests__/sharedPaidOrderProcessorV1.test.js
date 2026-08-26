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

test(
  "paid order business pipeline is extracted into a shared processor",
  () => {
    assert.match(
      route,
      /async function processPaidOrderSettlement\(\{[\s\S]*req,[\s\S]*orderId,[\s\S]*transId,[\s\S]*amount,[\s\S]*\}\)/
    );

    assert.match(
      route,
      /processPaidOrderSettlement[\s\S]*from\("orders"\)[\s\S]*pushOrderToIPOS[\s\S]*awardGamePlaysForPaidOrder/
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
      'awardGamePlaysForPaidOrder',
      'deductPoints',
      'addPoints',
      'leaderboard.updated',
    ];

    for (const token of required) {
      assert.match(
        route,
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
  "MoMo entry delegates to normalized processor after acknowledgement",
  () => {
    assert.match(
      route,
      /const momoIpnHandler[\s\S]*res\.json\(\{[\s\S]*success:\s*true[\s\S]*\}\);[\s\S]*await processNormalizedPaymentResult/
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
  "provider verification is deliberately not wired in this refactor",
  () => {
    assert.doesNotMatch(
      route,
      /verifyMomoSettlement\(/
    );

    assert.doesNotMatch(
      route,
      /settlement_verified_at/
    );
  }
);
