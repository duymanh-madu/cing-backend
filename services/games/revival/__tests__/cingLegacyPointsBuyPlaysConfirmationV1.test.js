"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../../routes/pointsRoutes.js"
  ),
  "utf8"
);

const begin = source.indexOf(
  'router.post("/buy-plays"'
);

const end = source.indexOf(
  '// POST /api/points/deduct',
  begin
);

assert.ok(begin >= 0);
assert.ok(end > begin);

const route = source.slice(begin, end);

test("existing cutover guard remains first", () => {
  const guard = route.indexOf(
    "rejectLegacyGamePlaysMutation(req, res)"
  );

  const debit = route.indexOf(
    "await deductPoints({"
  );

  assert.ok(guard >= 0);
  assert.ok(debit > guard);
});

test("invalid quantity rejected before debit", () => {
  const validation = route.indexOf(
    "CING_LEGACY_PLAY_QUANTITY_INVALID"
  );

  const debit = route.indexOf(
    "await deductPoints({"
  );

  assert.ok(validation >= 0);
  assert.ok(debit > validation);

  assert.match(
    route,
    /Number\.isSafeInteger\(quantity\)/
  );
});

test("debit ambiguity is tracked before attempt", () => {
  const attempted = route.indexOf(
    "debitAttempted = true"
  );

  const debit = route.indexOf(
    "await deductPoints({"
  );

  assert.ok(attempted >= 0);
  assert.ok(debit > attempted);
});

test("debit response is checked", () => {
  assert.match(
    route,
    /result\.success !== true/
  );
});

test("player read cannot silently become zero", () => {
  assert.match(
    route,
    /playerReadError \|\| !player/
  );
});

test("game-play credit uses compare-and-set", () => {
  assert.match(
    route,
    /\.eq\("game_plays", currentPlays\)/
  );
});

test("credit requires confirmed returned balance", () => {
  assert.match(
    route,
    /creditError \|\|\s*!creditedPlayer/
  );

  assert.match(
    route,
    /Number\(creditedPlayer\.game_plays\) !== newPlays/
  );
});

test("analytics follows confirmed credit", () => {
  const confirmation = route.indexOf(
    "CING_LEGACY_PLAY_CREDIT_UNCONFIRMED"
  );

  const analytics = route.indexOf(
    "await addPlays({"
  );

  assert.ok(confirmation >= 0);
  assert.ok(analytics > confirmation);
});

test("ambiguous purchase does not report success", () => {
  assert.match(
    route,
    /if \(debitAttempted\)/
  );

  assert.match(
    route,
    /res\.status\(409\)\.json/
  );

  assert.match(
    route,
    /CING_LEGACY_POINTS_DEBIT_PLAY_CREDIT_REVIEW_REQUIRED/
  );
});

test("no blind refund or second debit", () => {
  assert.equal(
    (
      route.match(
        /await deductPoints\(\{/g
      ) || []
    ).length,
    1
  );

  assert.doesNotMatch(
    route,
    /\bawait addPoints\(\{/
  );

  assert.doesNotMatch(
    route,
    /updateMemberPoint\(\{/
  );
});
