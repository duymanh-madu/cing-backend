"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(
  __dirname,
  "../../../.."
);

const SOURCE = fs.readFileSync(
  path.join(
    ROOT,
    "services/leaderboardService.js"
  ),
  "utf8"
);

const WORKER = fs.readFileSync(
  path.join(
    ROOT,
    "services/games/revival/workers/" +
    "cingOfflineReviveScoreDeliveryWorker.js"
  ),
  "utf8"
);

const START =
  "async function getGameLeaderboard(";

const END =
  "\nasync function getUserRank(";

assert.equal(
  SOURCE.split(START).length,
  2
);

const start =
  SOURCE.indexOf(START);

const end =
  SOURCE.indexOf(END, start);

assert.ok(end > start);

const functionSource =
  SOURCE.slice(start, end);

function createFixture(options = {}) {
  const reads = [];

  const scoreError =
    options.scoreError || null;

  const playerError =
    options.playerError || null;

  const scoreRows = [
    {
      user_id: "member-1",
      player_name: "Original Name",
      avatar: "",
      score: 500,
      played_at:
        "2026-09-23T00:00:00.000Z",
    },
  ];

  const supabase = {
    from(table) {
      const query = {
        select() {
          return query;
        },

        eq() {
          return query;
        },

        gte() {
          return query;
        },

        order() {
          return query;
        },

        limit() {
          return query;
        },

        in() {
          return query;
        },

        then(resolve, reject) {
          reads.push(table);

          const result =
            table === "game_scores"
              ? {
                  data:
                    scoreError
                      ? null
                      : scoreRows,

                  error: scoreError,
                }
              : table === "players"
                ? {
                    data:
                      playerError
                        ? null
                        : [
                            {
                              user_id:
                                "member-1",
                              display_name:
                                "Updated Name",
                              avatar: "",
                            },
                          ],

                    error: playerError,
                  }
                : null;

          if (!result) {
            throw new Error(
              `Unexpected table: ${table}`
            );
          }

          return Promise.resolve(result)
            .then(resolve, reject);
        },
      };

      return query;
    },
  };

  const context = {
    supabase,

    getLastMonday() {
      return "2026-09-21T00:00:00.000Z";
    },

    Map,
    Date,
    String,
  };

  vm.createContext(context);

  vm.runInContext(
    functionSource +
      "\nthis.readLeaderboard = getGameLeaderboard;",
    context
  );

  return {
    read:
      context.readLeaderboard,

    reads,
  };
}

test(
  "strict player read propagates players query failure",
  async () => {
    const fixture =
      createFixture({
        playerError:
          new Error(
            "players query unavailable"
          ),
      });

    await assert.rejects(
      fixture.read(
        "cing-stack-tower",
        {
          weekly: true,
          limit: 100,
          strictPlayerRead: true,
        }
      ),
      /players query unavailable/
    );

    assert.deepEqual(
      fixture.reads,
      [
        "game_scores",
        "players",
      ]
    );
  }
);

test(
  "legacy default preserves fallback on players error",
  async () => {
    const fixture =
      createFixture({
        playerError:
          new Error(
            "players query unavailable"
          ),
      });

    const result =
      await fixture.read(
        "cing-stack-tower",
        {
          weekly: true,
          limit: 100,
        }
      );

    assert.equal(
      result.length,
      1
    );

    assert.equal(
      result[0].player_name,
      "Original Name"
    );
  }
);

test(
  "strict success uses refreshed player display name",
  async () => {
    const fixture =
      createFixture();

    const result =
      await fixture.read(
        "cing-stack-tower",
        {
          strictPlayerRead: true,
        }
      );

    assert.equal(
      result.length,
      1
    );

    assert.equal(
      result[0].player_name,
      "Updated Name"
    );
  }
);

test(
  "game score query error propagates in both modes",
  async () => {
    for (const strict of [
      false,
      true,
    ]) {
      const fixture =
        createFixture({
          scoreError:
            new Error(
              "game scores unavailable"
            ),
        });

      await assert.rejects(
        fixture.read(
          "cing-stack-tower",
          {
            strictPlayerRead:
              strict,
          }
        ),
        /game scores unavailable/
      );

      assert.deepEqual(
        fixture.reads,
        ["game_scores"]
      );
    }
  }
);

test(
  "worker explicitly enables strict leaderboard read",
  () => {
    assert.match(
      WORKER,
      /strictPlayerRead:\s*true/
    );

    assert.match(
      functionSource,
      /strictPlayerRead\s*=\s*false/
    );
  }
);
