"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../..");

const read = (name) =>
  fs.readFileSync(
    path.join(ROOT, name),
    "utf8"
  );

test(
  "Gift notification route is authenticated and gated",
  () => {
    const source = read(
      "routes/cingGameEconomyV2Routes.js"
    );

    assert.match(
      source,
      /CING_GIFT_NOTIFICATION_READ_V1/
    );

    assert.match(
      source,
      /router\.get\(\s*"\/gifts\/notifications",\s*authMiddleware,\s*disabledGate,/
    );

    assert.match(
      source,
      /normalizePhone\(\s*req\.customer\?\.phone\s*\|\|\s*""\s*\)/
    );

    assert.match(
      source,
      /\.eq\("user_id",\s*phone\)/
    );

    assert.match(
      source,
      /\.eq\("type",\s*"gift_received"\)/
    );

    assert.match(
      source,
      /source:\s*"cing_game_gift_purchase_v1"/
    );

    assert.match(
      source,
      /\.limit\(50\)/
    );
  }
);

test(
  "Gift notification read contains no financial mutation",
  () => {
    const source = read(
      "routes/cingGameEconomyV2Routes.js"
    );

    const start = source.indexOf(
      "CING_GIFT_NOTIFICATION_READ_V1"
    );

    const end = source.indexOf(
      "CING_GIFT_NOTIFICATION_MARK_READ_V1",
      start
    );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const section = source.slice(
      start,
      end
    );

    assert.doesNotMatch(
      section,
      /\.insert\(|\.update\(|\.delete\(|\.rpc\(/
    );

    assert.doesNotMatch(
      section,
      /req\.params\.userId|req\.body\.userId|req\.query\.userId/
    );

    assert.match(
      section,
      /\.from\("notifications"\)/
    );
  }
);

test(
  "Existing Gift financial receipt remains separate",
  () => {
    const source = read(
      "services/games/revival/cingGameGiftPurchaseService.js"
    );

    assert.match(
      source,
      /purchaseGameGift/
    );

    assert.match(
      source,
      /receiptOf/
    );
  }
);
