const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../iposOrderService.js"),
  "utf8"
);

function extractFunction(name, nextName) {
  const start = source.indexOf(`function ${name}(`);

  assert.notEqual(
    start,
    -1,
    `${name} must exist`
  );

  const end = nextName
    ? source.indexOf(`function ${nextName}(`, start)
    : source.length;

  assert.notEqual(
    end,
    -1,
    `${nextName} must exist after ${name}`
  );

  return source.slice(start, end);
}

const projectionSource =
  extractFunction(
    "resolveIposPaymentProjection",
    "normalizeIposOrderType"
  );

const buildPayloadSource =
  extractFunction(
    "buildPayload",
    "emitRealtime"
  );

test(
  "Cing Wallet maps to exact iPOS CING_WALLET tender",
  () => {
    assert.match(
      projectionSource,
      /paymentMethod\s*===\s*"cing_wallet"[\s\S]*?Payment_Method:\s*"CING_WALLET"/
    );

    assert.match(
      projectionSource,
      /paymentMethod\s*===\s*"cing_wallet"[\s\S]*?Payment_Info:\s*"CING_WALLET"/
    );
  }
);

test(
  "Cing Wallet is internally verified before iPOS handoff",
  () => {
    assert.match(
      projectionSource,
      /paymentMethod\s*===\s*"cing_wallet"[\s\S]*?Trans_Verified:\s*1/
    );
  }
);

test(
  "Cing Wallet tender cannot redefine canonical payable amount",
  () => {
    assert.match(
      projectionSource,
      /const amount\s*=\s*normalizeNonNegativeMoney\(\s*order\.total_amount/
    );

    assert.match(
      projectionSource,
      /paymentMethod\s*===\s*"cing_wallet"[\s\S]*?Amount:\s*amount/
    );

    assert.match(
      buildPayloadSource,
      /const canonicalTotal\s*=\s*normalizeNonNegativeMoney\(\s*order\.total_amount/
    );

    assert.match(
      buildPayloadSource,
      /amount:\s*canonicalTotal/
    );

    assert.match(
      buildPayloadSource,
      /total_amount:\s*canonicalTotal/
    );

    assert.match(
      buildPayloadSource,
      /PaymentInfo:\s*resolveIposPaymentProjection\(\s*order,\s*momo_trans_id\s*\)/
    );
  }
);

test(
  "MoMo keeps existing MOMO_QR_AIO behavior",
  () => {
    assert.match(
      projectionSource,
      /paymentMethod\s*===\s*"momo"[\s\S]*?Payment_Method:\s*"MOMO_QR_AIO"/
    );

    assert.match(
      projectionSource,
      /paymentMethod\s*===\s*"momo"[\s\S]*?Payment_Info:\s*momoTransId\s*\?\s*"MOMO-"\s*\+\s*momoTransId\s*:\s*"MOMO"/
    );

    assert.match(
      projectionSource,
      /paymentMethod\s*===\s*"momo"[\s\S]*?Trans_Verified:\s*momoTransId\s*\?\s*1\s*:\s*0/
    );
  }
);

test(
  "Cing Wallet does not invent a new iPOS client contract",
  () => {
    assert.match(
      buildPayloadSource,
      /client:\s*order\.payment_method\s*===\s*"momo"\s*\?\s*"momo"\s*:\s*"online"/
    );

    assert.doesNotMatch(
      buildPayloadSource,
      /client:\s*"cing_wallet"/
    );
  }
);

test(
  "payment projection is centralized and buildPayload does not inline tender authority",
  () => {
    assert.match(
      buildPayloadSource,
      /PaymentInfo:\s*resolveIposPaymentProjection\(/
    );

    assert.doesNotMatch(
      buildPayloadSource,
      /Payment_Method:\s*"CING_WALLET"/
    );

    assert.doesNotMatch(
      buildPayloadSource,
      /Payment_Method:\s*"MOMO_QR_AIO"/
    );
  }
);
