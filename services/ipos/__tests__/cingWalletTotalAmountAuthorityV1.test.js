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

function extractBuildPayloadSource() {
  const start =
    source.indexOf(
      "function buildPayload("
    );

  const end =
    source.indexOf(
      "/**\n * ============================================\n * CREATE IPOS LOG",
      start
    );

  assert.ok(
    start >= 0,
    "buildPayload must exist"
  );

  assert.ok(
    end > start,
    "buildPayload boundary must be detectable"
  );

  return source.slice(
    start,
    end
  );
}

const buildPayloadSource =
  extractBuildPayloadSource();

test(
  "iPOS order amount authority is canonical order.total_amount",
  () => {
    assert.match(
      buildPayloadSource,
      /amount:\s*order\.total_amount\s*\|\|\s*0/
    );

    assert.match(
      buildPayloadSource,
      /total_amount:\s*order\.total_amount\s*\|\|\s*0/
    );
  }
);

test(
  "iPOS PaymentInfo amount uses the same canonical order total",
  () => {
    assert.match(
      buildPayloadSource,
      /PaymentInfo:\s*\{[\s\S]*?Amount:\s*order\.total_amount\s*\|\|\s*0/
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

    assert.doesNotMatch(
      buildPayloadSource,
      /Amount:\s*order\.payment_method/i
    );
  }
);

test(
  "Cing Wallet financial state can never become iPOS invoice total",
  () => {
    assert.doesNotMatch(
      buildPayloadSource,
      /\bwallet_balance\b/i
    );

    assert.doesNotMatch(
      buildPayloadSource,
      /\bbalance_after\b/i
    );

    assert.doesNotMatch(
      buildPayloadSource,
      /\bcing_wallet_accounts\b/i
    );

    assert.doesNotMatch(
      buildPayloadSource,
      /\bcing_wallet_transactions\b/i
    );

    assert.doesNotMatch(
      buildPayloadSource,
      /\btopup\b/i
    );
  }
);

test(
  "payment method may describe tender but cannot redefine payable amount",
  () => {
    assert.match(
      buildPayloadSource,
      /payment_method/
    );

    assert.match(
      buildPayloadSource,
      /Payment_Method/
    );

    assert.match(
      buildPayloadSource,
      /Payment_Info/
    );

    assert.match(
      buildPayloadSource,
      /Amount:\s*order\.total_amount\s*\|\|\s*0/
    );
  }
);

test(
  "ZBS total_amount upstream authority remains the actual order payable amount",
  () => {
    /*
     * iPOS owns the CRM/ZBS transaction variables.
     *
     * Therefore Cing must send the actual final payable value
     * as order.total_amount regardless of tender type:
     *
     * cash / momo / cing_wallet => same invoice total semantics.
     */
    assert.match(
      buildPayloadSource,
      /total_amount:\s*order\.total_amount\s*\|\|\s*0/
    );
  }
);
