"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const source =
  fs.readFileSync(
    "routes/gameRoutes.js",
    "utf8"
  );

const start =
  source.indexOf(
    "LEGACY USE GAME PLAY — RETIRED"
  );

const end =
  source.indexOf(
    "SAVE SCORE",
    start
  );

assert.ok(start >= 0);
assert.ok(end > start);

const route =
  source.slice(
    start,
    end
  );

assert.match(
  route,
  /"\/use-play"/
);

assert.match(
  route,
  /status\(410\)/
);

assert.match(
  route,
  /CING_LEGACY_GAME_PLAYS_CLOSED/
);

assert.doesNotMatch(
  route,
  /useGamePlay\(/
);

assert.doesNotMatch(
  route,
  /NO_GAME_PLAYS|game_plays|\.update\(|\.insert\(/
);

console.log(
  "PASS: /game/use-play is retired and zero-mutation"
);
