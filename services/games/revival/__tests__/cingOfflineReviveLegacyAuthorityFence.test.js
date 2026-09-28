"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(
  __dirname,
  "../../../.."
);

const routes = fs.readFileSync(
  path.join(root, "routes/gameRoutes.js"),
  "utf8"
);

const service = fs.readFileSync(
  path.join(root, "services/dailyChallengeService.js"),
  "utf8"
);

function section(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);

  assert.ok(
    a >= 0 && b > a,
    "source section not found"
  );

  return source.slice(a, b);
}

const reset = section(
  routes,
  '"/daily-challenge/reset"',
  '"/daily-challenge/sync-today"'
);

const getToday = section(
  service,
  "async function getTodayChallenge(",
  "async function syncTodayChallengesFromConfig()"
);

const claim = section(
  service,
  "async function claimChallengeReward(",
  "module.exports ="
);

test("reset excludes both Revival games", () => {
  assert.match(
    reset,
    /\.not\(\s*"game_key",\s*"in",\s*'\("black-pearl-rush","cing-stack-tower"\)'\s*\)/
  );
});

test("reset checks Supabase error", () => {
  assert.match(
    reset,
    /if \(resetError\) throw resetError;/
  );
});

test("reset retains Super Admin gate", () => {
  assert.match(
    routes,
    /router\.delete\(\s*"\/daily-challenge\/reset",\s*verifyAdmin,\s*requireChallengeSuperAdmin/
  );
});

test("existing Revival row remains readable", () => {
  assert.match(
    getToday,
    /if \(existing\) return existing;/
  );
});

test("missing Revival row cannot enter fallback", () => {
  const guard = getToday.indexOf(
    'game_key === "black-pearl-rush"'
  );

  const fallback = getToday.indexOf(
    "// Đọc config từ DB"
  );

  assert.ok(
    guard >= 0 && guard < fallback
  );

  assert.match(
    getToday.slice(guard, fallback),
    /"cing-stack-tower"[\s\S]*return null;/
  );
});

test("legacy Revival claim is blocked first", () => {
  const guard = claim.indexOf(
    'game_key === "black-pearl-rush"'
  );

  const lookup = claim.indexOf(
    "getTodayChallenge(game_key)"
  );

  assert.ok(
    guard >= 0 && guard < lookup
  );

  assert.match(
    claim,
    /REVIVAL_CHALLENGE_V2_AUTHORITY_REQUIRED/
  );
});

test("legacy financial RPC remains for other games", () => {
  assert.match(
    claim,
    /complete_daily_challenge_atomic/
  );
});

test("legacy sync Revival fence remains", () => {
  assert.match(
    service,
    /!\["black-pearl-rush", "cing-stack-tower"\]\.includes\(c\.game_key\)/
  );
});
