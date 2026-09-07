"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const source =
  fs.readFileSync(
    "services/paymentService.js",
    "utf8"
  );

test(
  "payment session preserves canonical checkout snapshot",
  () => {
    assert.match(
      source,
      /cart_snapshot:\s*\{[\s\S]*\.\.\.\(cart_snapshot\s*\|\|\s*\{\}\)/
    );
  }
);

test(
  "payment session does not rebuild canonical subtotal from top-level field",
  () => {
    const start =
      source.indexOf(
        "async function createPaymentSession"
      );

    const end =
      source.indexOf(
        "/**\n * =====================================================\n * VERIFY PAYMENT",
        start
      );

    assert.notEqual(
      start,
      -1
    );

    assert.notEqual(
      end,
      -1
    );

    const region =
      source.slice(
        start,
        end
      );

    const snapshotStart =
      region.indexOf(
        "cart_snapshot: {"
      );

    const snapshotEnd =
      region.indexOf(
        "expired_at",
        snapshotStart
      );

    const snapshotRegion =
      region.slice(
        snapshotStart,
        snapshotEnd
      );

    assert.doesNotMatch(
      snapshotRegion,
      /\n\s*subtotal,\s*\n/
    );

    assert.doesNotMatch(
      snapshotRegion,
      /\n\s*shipping_fee,\s*\n/
    );
  }
);

test(
  "delivery authority fields survive payment snapshot",
  () => {
    assert.match(
      source,
      /\.\.\.\(cart_snapshot\s*\|\|\s*\{\}\)/
    );

    /*
     * Preservation is structural rather than field-by-field, so
     * future canonical snapshot fields also survive automatically.
     */
  }
);
