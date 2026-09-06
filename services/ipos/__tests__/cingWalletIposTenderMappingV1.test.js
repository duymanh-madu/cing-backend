const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../iposOrderService.js"),
  "utf8"
);

function extractBuildPayloadSource() {
  const start = source.indexOf("function buildPayload(");
  const end = source.indexOf(
    "/**\n * ============================================\n * CREATE IPOS LOG",
    start
  );

  assert.ok(start >= 0, "buildPayload must exist");
  assert.ok(end > start, "buildPayload boundary must be detectable");

  return source.slice(start, end);
}

const buildPayloadSource = extractBuildPayloadSource();

test(
  "Cing Wallet maps to exact iPOS CING_WALLET tender",
  () => {
    assert.match(
      buildPayloadSource,
      /Payment_Method:\s*[\s\S]*?order\.payment_method\s*===\s*"cing_wallet"[\s\S]*?\?\s*"CING_WALLET"[\s\S]*?:\s*"MOMO_QR_AIO"/
    );

    assert.match(
      buildPayloadSource,
      /Payment_Info:\s*[\s\S]*?order\.payment_method\s*===\s*"cing_wallet"[\s\S]*?\?\s*"CING_WALLET"/
    );
  }
);

test(
  "Cing Wallet is internally verified before iPOS handoff",
  () => {
    assert.match(
      buildPayloadSource,
      /Trans_Verified:\s*[\s\S]*?order\.payment_method\s*===\s*"cing_wallet"[\s\S]*?\?\s*1[\s\S]*?:\s*\(momo_trans_id\s*\?\s*1\s*:\s*0\)/
    );
  }
);

test(
  "Cing Wallet tender cannot redefine canonical payable amount",
  () => {
    assert.match(
      buildPayloadSource,
      /Amount:\s*order\.total_amount\s*\|\|\s*0/
    );

    assert.doesNotMatch(
      buildPayloadSource,
      /Amount:\s*order\.payment_method/i
    );

    assert.doesNotMatch(
      buildPayloadSource,
      /Amount:\s*.*wallet.*balance/i
    );
  }
);

test(
  "MoMo keeps existing MOMO_QR_AIO behavior",
  () => {
    assert.match(
      buildPayloadSource,
      /"MOMO_QR_AIO"/
    );

    assert.match(
      buildPayloadSource,
      /"MOMO-"\s*\+\s*momo_trans_id/
    );

    assert.match(
      buildPayloadSource,
      /order\.payment_method\s*===\s*"momo"\s*\?\s*"MOMO"\s*:\s*""/
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
      /client:\s*["']cing_wallet["']/i
    );
  }
);
