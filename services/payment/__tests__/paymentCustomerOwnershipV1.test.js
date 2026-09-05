const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");


const ownership =
  fs.readFileSync(
    path.join(
      __dirname,
      "../paymentCustomerOwnershipService.js"
    ),
    "utf8"
  );

const recovery =
  fs.readFileSync(
    path.join(
      __dirname,
      "../paymentRecoveryService.js"
    ),
    "utf8"
  );

const reconciliation =
  fs.readFileSync(
    path.join(
      __dirname,
      "../paymentReconciliationService.js"
    ),
    "utf8"
  );

const routes =
  fs.readFileSync(
    path.join(
      __dirname,
      "../../../routes/paymentRoutes.js"
    ),
    "utf8"
  );


test(
  "recover and reconcile HTTP endpoints require authentication",
  () => {
    assert.match(
      routes,
      /router\.get\([\s\S]*"\/recover\/:transactionCode"[\s\S]*authMiddleware/
    );

    assert.match(
      routes,
      /router\.post\([\s\S]*"\/reconcile\/:transactionCode"[\s\S]*authMiddleware/
    );
  }
);


test(
  "authenticated customer is forwarded into both service boundaries",
  () => {
    const recoverStart =
      routes.indexOf(
        '"/recover/:transactionCode"'
      );

    const reconcileStart =
      routes.indexOf(
        '"/reconcile/:transactionCode"'
      );

    const recoverSection =
      routes.slice(
        recoverStart,
        reconcileStart
      );

    const reconcileSection =
      routes.slice(
        reconcileStart
      );

    assert.match(
      recoverSection,
      /recoverPayment\([\s\S]*customer:[\s\S]*req\.customer/
    );

    assert.match(
      reconcileSection,
      /reconcilePayment\([\s\S]*customer:[\s\S]*req\.customer/
    );
  }
);


test(
  "ownership authority derives canonical identity from authenticated customer",
  () => {
    assert.match(
      ownership,
      /normalizePhone/
    );

    assert.match(
      ownership,
      /customer\?\.phone/
    );

    assert.match(
      ownership,
      /PAYMENT_CUSTOMER_IDENTITY_REQUIRED/
    );
  }
);


test(
  "transaction lookup is followed by canonical ownership comparison",
  () => {
    const lookup =
      ownership.indexOf(
        "await findTransactionByCode("
      );

    const paymentIdentity =
      ownership.indexOf(
        "payment.user_id"
      );

    const comparison =
      ownership.indexOf(
        "paymentUserId !=="
      );

    assert.ok(
      lookup >= 0 &&
      paymentIdentity > lookup &&
      comparison > paymentIdentity
    );
  }
);


test(
  "missing and foreign transactions share the same external not-found contract",
  () => {
    const notFoundCalls =
      (
        ownership.match(
          /throw paymentNotFoundError\(\);/g
        ) || []
      ).length;

    assert.equal(
      notFoundCalls,
      2
    );

    assert.match(
      ownership,
      /code:[\s\S]*"PAYMENT_NOT_FOUND"[\s\S]*statusCode:[\s\S]*404/
    );
  }
);


test(
  "recovery cannot bypass shared ownership authority",
  () => {
    assert.match(
      recovery,
      /findOwnedPaymentByCode/
    );

    assert.doesNotMatch(
      recovery,
      /findTransactionByCode/
    );
  }
);


test(
  "reconciliation cannot bypass shared ownership authority",
  () => {
    assert.match(
      reconciliation,
      /findOwnedPaymentByCode/
    );

    assert.doesNotMatch(
      reconciliation,
      /findTransactionByCode/
    );

    const ownershipCheck =
      reconciliation.indexOf(
        "await findOwnedPaymentByCode("
      );

    const purposeCheck =
      reconciliation.indexOf(
        "payment.payment_purpose !=="
      );

    const entitlement =
      reconciliation.indexOf(
        "assertWalletMomoTopupEnabled();"
      );

    const enrollment =
      reconciliation.indexOf(
        "await ensureWalletTopupReconciliation("
      );

    assert.ok(
      ownershipCheck >= 0 &&
      purposeCheck > ownershipCheck &&
      entitlement > purposeCheck &&
      enrollment > entitlement
    );
  }
);


test(
  "HTTP ownership failures preserve service status codes",
  () => {
    const recoverStart =
      routes.indexOf(
        '"/recover/:transactionCode"'
      );

    const reconcileStart =
      routes.indexOf(
        '"/reconcile/:transactionCode"'
      );

    const recoverSection =
      routes.slice(
        recoverStart,
        reconcileStart
      );

    const reconcileSection =
      routes.slice(
        reconcileStart
      );

    assert.match(
      recoverSection,
      /error\?\.statusCode/
    );

    assert.match(
      recoverSection,
      /error\?\.code/
    );

    assert.match(
      reconcileSection,
      /error\?\.statusCode/
    );

    assert.match(
      reconcileSection,
      /error\?\.code/
    );
  }
);
