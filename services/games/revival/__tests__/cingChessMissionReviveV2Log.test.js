"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const source = fs.readFileSync(
  path.join(root, "routes/chessRoutes.js"),
  "utf8"
);

const marker =
  "[CHESS] Win mission awarded:";

function chessLogRegion() {
  const position = source.indexOf(marker);

  assert.ok(
    position >= 0,
    "Chess win mission log must exist"
  );

  return source.slice(
    Math.max(0, position - 160),
    position + 420
  );
}

test(
  "Chess win mission still uses shared completion",
  () => {
    assert.match(
      source,
      /completeManualMission/
    );
  }
);

test(
  "Chess log selects actual reward currency",
  () => {
    const region = chessLogRegion();

    assert.match(
      region,
      /result\.reward_currency\s*===\s*"revive_credit"/
    );
  }
);

test(
  "V2 log names Revive Credit",
  () => {
    const region = chessLogRegion();

    assert.match(
      region,
      /result\.revive_credits_awarded\} Revive Credit/
    );
  }
);

test(
  "V1 log remains compatible",
  () => {
    const region = chessLogRegion();

    assert.match(
      region,
      /result\.plays_awarded\} plays/
    );
  }
);

test(
  "both branches retain loyalty points",
  () => {
    const region = chessLogRegion();

    const matches = region.match(
      /result\.points_awarded\} points/g
    ) || [];

    assert.equal(matches.length, 2);
  }
);
