"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const source =
  fs.readFileSync(
    "routes/pointsRoutes.js",
    "utf8"
  );

const start =
  source.indexOf(
    "// POST /api/points/buy-plays"
  );

const end =
  source.indexOf(
    "// POST /api/points/deduct",
    start
  );

assert.ok(start >= 0);
assert.ok(end > start);

const route =
  source.slice(
    start,
    end
  );

test(
  "legacy points buy-plays is permanently closed",
  () => {
    assert.match(
      route,
      /sendLegacyGamePlaysClosed\(res\)/
    );
  }
);

test(
  "closed route cannot debit loyalty points",
  () => {
    assert.doesNotMatch(
      route,
      /deductPoints|point_transactions/
    );
  }
);

test(
  "closed route cannot mutate play balance",
  () => {
    assert.doesNotMatch(
      route,
      /game_plays|addPlays|\.update\(/
    );
  }
);
