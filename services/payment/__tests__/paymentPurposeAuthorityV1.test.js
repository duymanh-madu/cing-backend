const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

function read(file) {
  return fs.readFileSync(
    file,
    "utf8"
  );
}

const txService =
  read(
    "services/payment/paymentTransactionService.js"
  );

const orchestrator =
  read(
    "services/payment/paymentOrchestratorService.js"
  );

const checkoutRoutes =
  read(
    "routes/checkoutRoutes.js"
  );

test(
  "payment transaction service persists explicit payment purpose",
  () => {
    assert.match(
      txService,
      /payment_purpose\s*=\s*"order"/
    );

    assert.match(
      txService,
      /payment_purpose,/
    );
  }
);

test(
  "payment orchestrator recognizes only order or wallet_topup",
  () => {
    assert.match(
      orchestrator,
      /payload\.payment_purpose === "wallet_topup"[\s\S]*\? "wallet_topup"[\s\S]*: "order"/
    );
  }
);

test(
  "commerce checkout hard-binds payment purpose to order",
  () => {
    assert.match(
      checkoutRoutes,
      /payment_purpose:\s*"order"/
    );

    assert.doesNotMatch(
      checkoutRoutes,
      /payment_purpose:\s*req\.body/
    );
  }
);

test(
  "wallet top-up payment description is distinct from order payment",
  () => {
    assert.match(
      orchestrator,
      /Nạp tiền Cing Wallet/
    );

    assert.match(
      orchestrator,
      /Thanh toán đơn hàng/
    );
  }
);


const paymentRoutes =
  read(
    "routes/paymentRoutes.js"
  );

test(
  "public payments create-session hard-binds payment purpose to order",
  () => {
    assert.match(
      paymentRoutes,
      /createPaymentSession\(\{[\s\S]*\.\.\.req\.body[\s\S]*payment_purpose:\s*"order"[\s\S]*\}\)/
    );

    assert.doesNotMatch(
      paymentRoutes,
      /createPaymentSession\(\s*req\.body\s*\)/
    );
  }
);
