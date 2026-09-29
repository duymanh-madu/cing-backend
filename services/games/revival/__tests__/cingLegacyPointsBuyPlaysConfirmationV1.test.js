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

const route =
  source.slice(
    start,
    end
  );

test(
  "retired endpoint fails closed before all mutation",
  () => {
    assert.match(
      route,
      /sendLegacyGamePlaysClosed\(res\)/
    );

    assert.doesNotMatch(
      route,
      /deductPoints|game_plays|addPlays|debitAttempted/
    );
  }
);
