"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const paymentFile =
  path.resolve(
    __dirname,
    "../cingWalletPosPaymentService.js"
  );

const constantsFile =
  path.resolve(
    __dirname,
    "../../realtime/realtimeEventConstants.js"
  );

const validatorFile =
  path.resolve(
    __dirname,
    "../../realtime/realtimeEventValidator.js"
  );

const sessionFile =
  path.resolve(
    __dirname,
    "../cingWalletPosSessionService.js"
  );

const paymentSource =
  fs.readFileSync(
    paymentFile,
    "utf8"
  );

const validatorSource =
  fs.readFileSync(
    validatorFile,
    "utf8"
  );

const sessionSource =
  fs.readFileSync(
    sessionFile,
    "utf8"
  );

const {
  REALTIME_EVENTS,
} =
  require(constantsFile);

const {
  validateEventName,
} =
  require(validatorFile);

function pass(
  message
) {
  console.log(
    `PASS: ${message}`
  );
}

/*
 * Settlement authority must remain exactly the same.
 */
assert.equal(
  (
    paymentSource.match(
      /cing_wallet_settle_pos_payment_atomic_v1/g
    ) || []
  ).length,
  1
);

pass(
  "exactly one canonical settlement RPC remains"
);

assert.match(
  paymentSource,
  /p_payment_token_id:\s*verified\.paymentTokenId/
);

assert.match(
  paymentSource,
  /p_user_id:\s*userId/
);

pass(
  "settlement RPC arguments remain canonical"
);

/*
 * Diagnostic must be tied specifically to the settlement RPC.
 */
const settlementRpcIndex =
  paymentSource.indexOf(
    '"cing_wallet_settle_pos_payment_atomic_v1"'
  );

const diagnosticIndex =
  paymentSource.indexOf(
    '"[CING WALLET POS] settlement RPC failed"',
    settlementRpcIndex
  );

const mapIndex =
  paymentSource.indexOf(
    "throw mapRpcError",
    settlementRpcIndex
  );

assert.ok(
  settlementRpcIndex >= 0
);

assert.ok(
  diagnosticIndex >
    settlementRpcIndex
);

assert.ok(
  mapIndex >
    diagnosticIndex
);

pass(
  "diagnostic is inside exact settlement failure path"
);

const diagnosticSource =
  paymentSource.slice(
    diagnosticIndex,
    mapIndex
  );

for (
  const field of [
    "error?.code",
    "error?.message",
    "error?.details",
    "error?.hint",
  ]
) {
  assert.ok(
    diagnosticSource.includes(
      field
    ),
    `missing diagnostic field ${field}`
  );
}

pass(
  "diagnostic retains PostgreSQL/Supabase error fields"
);

/*
 * No command/customer/financial material in diagnostic object.
 */
for (
  const forbidden of [
    "customer",
    "capability",
    "paymentTokenId",
    "userId",
    "wallet_balance",
    "amount",
  ]
) {
  assert.equal(
    diagnosticSource.includes(
      forbidden
    ),
    false,
    `diagnostic leaks forbidden material: ${forbidden}`
  );
}

pass(
  "diagnostic excludes customer, capability and financial material"
);

/*
 * Public mapping behavior remains in place.
 */
assert.match(
  paymentSource.slice(
    diagnosticIndex,
    diagnosticIndex + 2000
  ),
  /throw mapRpcError\(\s*error\s*\)/
);

pass(
  "public RPC error mapping remains unchanged"
);

/*
 * Canonical validator must still derive allowed names
 * from realtimeEventConstants.
 */
assert.match(
  validatorSource,
  /Object\.values\(\s*REALTIME_EVENTS\s*\)/
);

pass(
  "validator remains backed by canonical realtime constants"
);

const expectedEvents = {
  WALLET_POS_SESSION_DISCOVERED:
    "wallet.pos.session.discovered",

  WALLET_POS_QR_READY:
    "wallet.pos.qr.ready",

  WALLET_POS_PAYMENT_PAID:
    "wallet.pos.payment.paid",

  WALLET_POS_RECONCILIATION_MATCHED:
    "wallet.pos.reconciliation.matched",

  WALLET_POS_RECONCILIATION_ALERT:
    "wallet.pos.reconciliation.alert",
};

for (
  const [
    key,
    event,
  ] of Object.entries(
    expectedEvents
  )
) {
  assert.equal(
    REALTIME_EVENTS[key],
    event
  );

  assert.equal(
    validateEventName(
      event
    ),
    true
  );
}

pass(
  "all five Wallet POS events pass canonical validator"
);

/*
 * Every wallet.pos.* event emitted by the session service
 * must be represented by the registered set.
 */
const emittedEvents =
  [
    ...sessionSource.matchAll(
      /["'](wallet\.pos\.[a-zA-Z0-9._-]+)["']/g
    ),
  ]
    .map(
      match =>
        match[1]
    )
    .filter(
      event =>
        event !==
        "wallet.pos.operate"
    );

const uniqueEmittedEvents =
  [
    ...new Set(
      emittedEvents
    ),
  ].sort();

const registeredEvents =
  Object.values(
    expectedEvents
  ).sort();

assert.deepEqual(
  uniqueEmittedEvents,
  registeredEvents
);

pass(
  "session-service Wallet POS event set exactly matches registered constants"
);

console.log(
  "PASS: P9.22B contract complete"
);
