"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../dailyChallengeService.js"
  ),
  "utf8"
);

const begin =
  "async function syncTodayChallengesFromConfig() {";

const end =
  "// Kiem tra combo va claim reward";

const startIndex =
  source.indexOf(begin);

const endIndex =
  source.indexOf(
    end,
    startIndex
  );

assert.ok(
  startIndex >= 0 &&
  endIndex > startIndex,
  "sync function must exist"
);

const sync =
  source.slice(
    startIndex,
    endIndex
  );

test(
  "legacy sync excludes Revival games from enabled list",
  () => {
    assert.match(
      sync,
      /c\.enabled !== false\s*&&\s*!\["black-pearl-rush", "cing-stack-tower"\]\.includes\(c\.game_key\)/
    );
  }
);

test(
  "legacy sync cannot delete Revival daily rows",
  () => {
    assert.match(
      sync,
      /!row\.completed\s*&&\s*!\["black-pearl-rush", "cing-stack-tower"\]\.includes\(row\.game_key\)\s*&&\s*!activeGameKeys\.includes\(row\.game_key\)/
    );
  }
);

test(
  "non-Revival challenge synchronization remains",
  () => {
    assert.match(
      sync,
      /normalizeChallengeConfig/
    );

    assert.match(
      sync,
      /daily_challenges/
    );

    assert.match(
      sync,
      /activeGameKeys/
    );
  }
);

test(
  "legacy financial claim remains outside patch",
  () => {
    const claim = source.slice(
      endIndex
    );

    assert.match(
      claim,
      /complete_daily_challenge_atomic/
    );
  }
);
