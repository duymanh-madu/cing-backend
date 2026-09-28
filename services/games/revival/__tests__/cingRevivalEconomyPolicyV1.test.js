"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REVIVAL_GAME_KEYS,
  REVIVAL_COSTS,
  MAX_REVIVES_PER_SESSION,
  MAX_SESSION_REVIVAL_COST,
  getNextRevivalCost,
  getConsumedRevivalCredits,
} = require("../domain/cingRevivalEconomyPolicyV1");

test("exactly three offline games use shared revival policy", () => {
  assert.deepEqual(REVIVAL_GAME_KEYS, [
    "cing-block-puzzle",
    "cing-stack-tower",
    "black-pearl-rush",
  ]);

  assert.equal(MAX_REVIVES_PER_SESSION, 5);
});

test("costs are exactly 1, 2, 4, 8, 16", () => {
  assert.deepEqual(REVIVAL_COSTS, [
    1, 2, 4, 8, 16,
  ]);

  for (const gameKey of REVIVAL_GAME_KEYS) {
    for (let used = 0; used < 5; used += 1) {
      const quote = getNextRevivalCost({
        gameKey,
        revivesUsed: used,
      });

      assert.equal(
        quote.next_revive_index,
        used + 1
      );

      assert.equal(
        quote.credit_cost,
        REVIVAL_COSTS[used]
      );
    }
  }
});

test("five revivals consume exactly 31 credits", () => {
  assert.equal(MAX_SESSION_REVIVAL_COST, 31);

  assert.deepEqual(
    Array.from(
      { length: 6 },
      (_, used) => getConsumedRevivalCredits(used)
    ),
    [0, 1, 3, 7, 15, 31]
  );
});

test("sixth revival is rejected in every game", () => {
  for (const gameKey of REVIVAL_GAME_KEYS) {
    assert.throws(
      () => getNextRevivalCost({
        gameKey,
        revivesUsed: 5,
      }),
      {
        code: "REVIVAL_LIMIT_REACHED",
      }
    );
  }
});

test("unsupported games cannot enter revival economy", () => {
  for (const gameKey of [
    "chess",
    "cing-piu-piu",
    "",
    null,
    undefined,
  ]) {
    assert.throws(
      () => getNextRevivalCost({
        gameKey,
        revivesUsed: 0,
      }),
      {
        code: "REVIVAL_GAME_NOT_SUPPORTED",
      }
    );
  }
});

test("invalid revive counts are rejected", () => {
  for (const revivesUsed of [
    -1,
    6,
    1.5,
    "1",
    null,
    NaN,
    Infinity,
  ]) {
    assert.throws(
      () => getNextRevivalCost({
        gameKey: "cing-stack-tower",
        revivesUsed,
      }),
      {
        code: "REVIVAL_COUNT_INVALID",
      }
    );
  }
});

test("published policy cannot be mutated", () => {
  assert.equal(
    Object.isFrozen(REVIVAL_GAME_KEYS),
    true
  );

  assert.equal(
    Object.isFrozen(REVIVAL_COSTS),
    true
  );
});
