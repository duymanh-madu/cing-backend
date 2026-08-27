const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const service =
  fs.readFileSync(
    "services/wallet/cingWalletOrderPaymentService.js",
    "utf8"
  );

test(
  "wallet order payment service calls only bounded PostgreSQL settlement authority",
  () => {
    assert.match(
      service,
      /supabase\.rpc\(\s*"cing_wallet_settle_order_payment_atomic"/
    );

    assert.match(
      service,
      /p_payment_transaction_id:\s*authoritativePaymentTransactionId/
    );

    assert.doesNotMatch(
      service,
      /p_user_id\s*:/
    );

    assert.doesNotMatch(
      service,
      /p_amount\s*:/
    );
  }
);

test(
  "wallet order payment enters shared commerce processor only after atomic settlement",
  () => {
    const rpcPos =
      service.indexOf(
        '"cing_wallet_settle_order_payment_atomic"'
      );

    const processorPos =
      service.indexOf(
        "await processPaidOrderSettlement({"
      );

    assert.ok(
      rpcPos >= 0,
      "wallet settlement RPC missing"
    );

    assert.ok(
      processorPos >= 0,
      "shared paid order processor call missing"
    );

    assert.ok(
      rpcPos < processorPos,
      "commerce must run only after wallet settlement"
    );
  }
);

test(
  "shared commerce processor receives canonical settlement values",
  () => {
    assert.match(
      service,
      /orderId:\s*transactionCode/
    );

    assert.match(
      service,
      /transId:\s*settlementReference/
    );

    assert.match(
      service,
      /amount,\s*\}\);/
    );
  }
);

test(
  "wallet order payment service does not duplicate commerce side effects",
  () => {
    const forbidden = [
      "pushOrderToIPOS",
      "checkOrderMissions",
      "updatePartnerMonthlySpending",
      "awardGamePlaysForPaidOrder",
      "deductPoints",
      "addPoints",
      "leaderboard.updated",
      '.from("orders")',
      ".from('orders')",
    ];

    for (
      const token of forbidden
    ) {
      assert.equal(
        service.includes(token),
        false,
        `duplicated commerce responsibility: ${token}`
      );
    }
  }
);

test(
  "wallet service never mutates wallet tables directly",
  () => {
    assert.doesNotMatch(
      service,
      /\.from\(\s*["']cing_wallet_accounts["']\s*\)/
    );

    assert.doesNotMatch(
      service,
      /\.from\(\s*["']cing_wallet_transactions["']\s*\)/
    );

    assert.doesNotMatch(
      service,
      /cing_wallet_apply_mutation_private/
    );
  }
);

test(
  "caller controls only payment transaction identity",
  () => {
    const signatureMatch =
      service.match(
        /async function settleWalletOrderPayment\(\{([\s\S]*?)\}\)\s*\{/
      );

    assert.ok(
      signatureMatch,
      "wallet order payment service signature missing"
    );

    const parameters =
      signatureMatch[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

    assert.deepEqual(
      parameters,
      [
        "req",
        "paymentTransactionId",
      ]
    );
  }
);
