const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../iposOrderService.js"
  ),
  "utf8"
);

function extractFunction(name, nextName) {
  const start =
    source.indexOf(
      `function ${name}(`
    );

  assert.notEqual(
    start,
    -1,
    `${name} must exist`
  );

  const end =
    nextName
      ? source.indexOf(
          `function ${nextName}(`,
          start
        )
      : source.length;

  assert.notEqual(
    end,
    -1,
    `${nextName} must exist after ${name}`
  );

  return source.slice(
    start,
    end
  );
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
  "iPOS order amount authority is canonical validated order.total_amount",
  () => {
    assert.match(
      buildPayloadSource,
      /const canonicalTotal\s*=\s*normalizeNonNegativeMoney\(\s*order\.total_amount,\s*"IPOS_ORDER_TOTAL_INVALID"\s*\)/
    );

    assert.match(
      buildPayloadSource,
      /amount:\s*canonicalTotal/
    );

    assert.match(
      buildPayloadSource,
      /total_amount:\s*canonicalTotal/
    );
  }
);

test(
  "iPOS PaymentInfo amount derives independently from the same canonical order total",
  () => {
    assert.match(
      projectionSource,
      /const amount\s*=\s*normalizeNonNegativeMoney\(\s*order\.total_amount,\s*"IPOS_ORDER_TOTAL_INVALID"\s*\)/
    );

    assert.match(
      buildPayloadSource,
      /PaymentInfo:\s*resolveIposPaymentProjection\(\s*order,\s*momo_trans_id\s*\)/
    );

    assert.match(
      projectionSource,
      /paymentMethod\s*===\s*"cing_wallet"[\s\S]*?Amount:\s*amount/
    );

    assert.match(
      projectionSource,
      /paymentMethod\s*===\s*"momo"[\s\S]*?Amount:\s*amount/
    );
  }
);

test(
  "iPOS payable amount is independent from payment method",
  () => {
    assert.doesNotMatch(
      buildPayloadSource,
      /amount:\s*order\.payment_method/i
    );

    assert.doesNotMatch(
      buildPayloadSource,
      /total_amount:\s*order\.payment_method/i
    );

    assert.match(
      projectionSource,
      /const amount\s*=\s*normalizeNonNegativeMoney\(\s*order\.total_amount,\s*"IPOS_ORDER_TOTAL_INVALID"\s*\)/
    );

    assert.doesNotMatch(
      projectionSource,
      /const amount\s*=\s*normalizeNonNegativeMoney\(\s*(?:paymentMethod|order\.payment_method)/
    );

    assert.doesNotMatch(
      projectionSource,
      /Amount:\s*(?:paymentMethod|order\.payment_method)/
    );
  }
);

test(
  "Cing Wallet financial state can never become iPOS invoice total",
  () => {
    const paymentAuthority =
      buildPayloadSource +
      "\n" +
      projectionSource;

    assert.doesNotMatch(
      paymentAuthority,
      /\bwallet_balance\b/i
    );

    assert.doesNotMatch(
      paymentAuthority,
      /\bbalance_after\b/i
    );

    assert.doesNotMatch(
      paymentAuthority,
      /\bcing_wallet_accounts\b/i
    );

    assert.doesNotMatch(
      paymentAuthority,
      /\bcing_wallet_transactions\b/i
    );

    assert.doesNotMatch(
      paymentAuthority,
      /\btopup\b/i
    );
  }
);

test(
  "payment method describes tender but cannot redefine payable amount",
  () => {
    assert.match(
      projectionSource,
      /const paymentMethod\s*=/
    );

    assert.match(
      projectionSource,
      /Payment_Method:/
    );

    assert.match(
      projectionSource,
      /Payment_Info:/
    );

    assert.match(
      projectionSource,
      /const amount\s*=\s*normalizeNonNegativeMoney\(\s*order\.total_amount/
    );

    assert.doesNotMatch(
      projectionSource,
      /Amount:\s*paymentMethod/
    );
  }
);

test(
  "ZBS total_amount upstream authority remains the actual canonical order payable amount",
  () => {
    /*
     * order.total_amount is validated once into canonicalTotal before
     * buildPayload exposes the value to iPOS/ZBS.
     *
     * Tender selection remains a separate payment projection concern.
     */
    assert.match(
      buildPayloadSource,
      /const canonicalTotal\s*=\s*normalizeNonNegativeMoney\(\s*order\.total_amount/
    );

    assert.match(
      buildPayloadSource,
      /total_amount:\s*canonicalTotal/
    );

    assert.doesNotMatch(
      buildPayloadSource,
      /total_amount:\s*(?:order\.)?payment_method/i
    );
  }
);
