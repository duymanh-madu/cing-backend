"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../..");

const source = fs.readFileSync(
  path.join(
    ROOT,
    "services/leaderboardResetService.js"
  ),
  "utf8"
);

const START =
  "async function checkAndNotifyTop1Changes(";

const END = "\nmodule.exports =";

assert.equal(
  source.split(START).length,
  2,
  "Top1 function must have one exact boundary"
);

const start = source.indexOf(START);
const end = source.indexOf(END, start);

assert.ok(end > start);

const top1Source = source.slice(start, end);

const OLD_USER = "old-member";
const NEW_USER = "new-member";

const GAME = "cing-stack-tower";

const WEEKLY_KEY =
  "game_weekly_cing-stack-tower_top1";

function createFixture(options = {}) {
  const state = {
    emitted: [],
    updates: [],
    reads: [],
  };

  const cache = Object.prototype.hasOwnProperty.call(
    options,
    "cache"
  )
    ? options.cache
    : {
        [WEEKLY_KEY]: OLD_USER,
      };

  const gameRows = Object.prototype.hasOwnProperty.call(
    options,
    "gameRows"
  )
    ? options.gameRows
    : [
        {
          user_id: NEW_USER,
          player_name: "New Player",
          score: 500,
          played_at:
            "2026-09-23T00:00:00.000Z",
        },
      ];

  const config = {
    leaderboard_config: {
      games: {
        [GAME]: {
          enabled: true,
          weekly_reset: true,
          display_name: "Cing Stack Tower",
        },
      },
    },

    // Nonempty all-time configuration
    // prevents an unrelated all-time
    // notification in these focused tests.
    alltime_games_config: {
      games: {
        [GAME]: {
          enabled: false,
        },
      },
    },

    top1_cache: cache,
  };

  function query(table) {
    const predicates = [];

    let updatePayload = null;

    const builder = {
      select() {
        return builder;
      },

      eq(key, value) {
        predicates.push(["eq", key, value]);
        return builder;
      },

      gt(key, value) {
        predicates.push(["gt", key, value]);
        return builder;
      },

      gte(key, value) {
        predicates.push(["gte", key, value]);
        return builder;
      },

      order() {
        return builder;
      },

      limit() {
        return builder;
      },

      update(payload) {
        updatePayload = payload;
        return builder;
      },

      single() {
        if (table !== "app_configs") {
          throw new Error(
            `Unexpected single(): ${table}`
          );
        }

        if (options.configError) {
          return Promise.resolve({
            data: null,
            error: new Error(
              "configuration query failed"
            ),
          });
        }

        return Promise.resolve({
          data: config,
          error: null,
        });
      },

      maybeSingle() {
        state.reads.push({
          table,
          predicates,
        });

        if (
          options.failSpending &&
          table === "players" &&
          predicates.some(
            item => item[0] === "gt"
          )
        ) {
          return Promise.resolve({
            data: null,
            error: new Error(
              "spending query failed"
            ),
          });
        }

        if (
          options.failChess &&
          table === "chess_stats"
        ) {
          return Promise.resolve({
            data: null,
            error: new Error(
              "chess query failed"
            ),
          });
        }

        if (
          options.failPlayer &&
          table === "players" &&
          predicates.some(
            item => item[0] === "eq" &&
              item[1] === "user_id"
          )
        ) {
          return Promise.resolve({
            data: null,
            error: new Error(
              "player lookup failed"
            ),
          });
        }

        if (
          table === "players" &&
          predicates.some(
            item => item[0] === "eq" &&
              item[1] === "user_id"
          )
        ) {
          return Promise.resolve({
            data: {
              user_id: NEW_USER,
              display_name: "New Player",
            },
            error: null,
          });
        }

        return Promise.resolve({
          data: null,
          error: null,
        });
      },

      then(resolve, reject) {
        if (updatePayload !== null) {
          state.updates.push(updatePayload);

          return Promise.resolve({
            data: null,
            error: options.cacheError
              ? new Error(
                  "top1 cache update failed"
                )
              : null,
          }).then(resolve, reject);
        }

        if (table === "game_scores") {
          state.reads.push({
            table,
            predicates,
          });

          return Promise.resolve(
            options.failGame
              ? {
                  data: null,
                  error: new Error(
                    "game board query failed"
                  ),
                }
              : {
                  data: gameRows,
                  error: null,
                }
          ).then(resolve, reject);
        }

        throw new Error(
          `Unexpected awaited query: ${table}`
        );
      },
    };

    return builder;
  }

  const supabase = {
    from(table) {
      if (
        ![
          "app_configs",
          "players",
          "game_scores",
          "chess_stats",
        ].includes(table)
      ) {
        throw new Error(
          `Unexpected Supabase table: ${table}`
        );
      }

      return query(table);
    },
  };

  const io = {
    emit(name, payload) {
      if (options.emitError) {
        throw new Error(
          "socket emit failed"
        );
      }

      state.emitted.push({
        name,
        payload,
      });
    },
  };

  const quietConsole = {
    log() {},
    warn() {},
    error() {},
  };

  const context = {
    supabase,

    resolvePlayerName(player) {
      return (
        player?.display_name ||
        player?.zalo_name ||
        player?.player_name ||
        player?.user_id ||
        "Cing iu"
      );
    },

    getLastMonday() {
      return "2026-09-21T00:00:00.000Z";
    },

    console: quietConsole,

    global: {
      _ioInstance: null,
      io: null,
    },
  };

  vm.createContext(context);

  vm.runInContext(
    top1Source +
      "\nthis.testTop1 = checkAndNotifyTop1Changes;",
    context,
    {
      filename:
        "leaderboardResetService.Top1.runtime.js",
    }
  );

  return {
    state,
    io,
    run: context.testTop1,
  };
}

test(
  "strict mode verifies unchanged Top1 without broadcast",
  async () => {
    const fixture = createFixture({
      cache: {
        [WEEKLY_KEY]: NEW_USER,
      },
    });

    const result = await fixture.run(
      fixture.io,
      {
        strictDelivery: true,
      }
    );

    assert.equal(result.verified, true);
    assert.equal(
      result.notifications_count,
      0
    );
    assert.equal(result.broadcasted, 0);

    assert.equal(
      fixture.state.emitted.length,
      0
    );

    assert.equal(
      fixture.state.updates.length,
      0
    );
  }
);

test(
  "strict mode preserves silent baseline",
  async () => {
    const fixture = createFixture({
      cache: {},
    });

    const result = await fixture.run(
      fixture.io,
      {
        strictDelivery: true,
      }
    );

    assert.equal(result.verified, true);

    assert.equal(
      result.notifications_count,
      0
    );

    assert.equal(
      fixture.state.emitted.length,
      0
    );

    assert.equal(
      fixture.state.updates.length,
      1
    );

    assert.equal(
      fixture.state.updates[0]
        .top1_cache[WEEKLY_KEY],
      NEW_USER
    );
  }
);

test(
  "strict mode broadcasts and returns verified result",
  async () => {
    const fixture = createFixture();

    const result = await fixture.run(
      fixture.io,
      {
        strictDelivery: true,
      }
    );

    assert.equal(result.verified, true);
    assert.equal(
      result.notifications_count,
      1
    );
    assert.equal(result.broadcasted, 1);

    assert.equal(
      fixture.state.emitted.length,
      1
    );

    assert.equal(
      fixture.state.emitted[0].name,
      "notification.broadcast"
    );

    assert.equal(
      fixture.state.emitted[0]
        .payload.data.event,
      "leaderboard.top1_changed"
    );

    assert.equal(
      fixture.state.emitted[0]
        .payload.data.cacheKey,
      WEEKLY_KEY
    );

    assert.equal(
      fixture.state.updates.length,
      1
    );

    assert.equal(
      fixture.state.updates[0]
        .top1_cache[WEEKLY_KEY],
      NEW_USER
    );
  }
);

test(
  "strict mode rejects missing IO when change needs broadcast",
  async () => {
    const fixture = createFixture();

    await assert.rejects(
      fixture.run(
        null,
        {
          strictDelivery: true,
        }
      ),
      /TOP1_IO_UNAVAILABLE/
    );

    assert.equal(
      fixture.state.emitted.length,
      0
    );

    assert.equal(
      fixture.state.updates.length,
      0
    );
  }
);

test(
  "strict mode rejects configuration error",
  async () => {
    const fixture = createFixture({
      configError: true,
    });

    await assert.rejects(
      fixture.run(
        fixture.io,
        {
          strictDelivery: true,
        }
      ),
      /configuration query failed/
    );
  }
);

test(
  "strict mode rejects spending query error",
  async () => {
    const fixture = createFixture({
      failSpending: true,
    });

    await assert.rejects(
      fixture.run(
        fixture.io,
        {
          strictDelivery: true,
        }
      ),
      /spending query failed/
    );
  }
);

test(
  "strict mode rejects chess query error",
  async () => {
    const fixture = createFixture({
      failChess: true,
    });

    await assert.rejects(
      fixture.run(
        fixture.io,
        {
          strictDelivery: true,
        }
      ),
      /chess query failed/
    );
  }
);

test(
  "strict mode rejects game query error",
  async () => {
    const fixture = createFixture({
      failGame: true,
    });

    await assert.rejects(
      fixture.run(
        fixture.io,
        {
          strictDelivery: true,
        }
      ),
      /game board query failed/
    );
  }
);

test(
  "strict mode rejects player lookup error",
  async () => {
    const fixture = createFixture({
      failPlayer: true,
    });

    await assert.rejects(
      fixture.run(
        fixture.io,
        {
          strictDelivery: true,
        }
      ),
      /player lookup failed/
    );
  }
);

test(
  "strict mode rejects emit failure without cache update",
  async () => {
    const fixture = createFixture({
      emitError: true,
    });

    await assert.rejects(
      fixture.run(
        fixture.io,
        {
          strictDelivery: true,
        }
      ),
      /socket emit failed/
    );

    assert.equal(
      fixture.state.emitted.length,
      0
    );

    assert.equal(
      fixture.state.updates.length,
      0
    );
  }
);

test(
  "strict mode rejects baseline cache update failure",
  async () => {
    const fixture = createFixture({
      cache: {},
      cacheError: true,
    });

    await assert.rejects(
      fixture.run(
        fixture.io,
        {
          strictDelivery: true,
        }
      ),
      /top1 cache update failed/
    );

    assert.equal(
      fixture.state.emitted.length,
      0
    );
  }
);

test(
  "strict mode rejects post-broadcast cache update failure",
  async () => {
    const fixture = createFixture({
      cacheError: true,
    });

    await assert.rejects(
      fixture.run(
        fixture.io,
        {
          strictDelivery: true,
        }
      ),
      /top1 cache update failed/
    );

    assert.equal(
      fixture.state.emitted.length,
      1
    );
  }
);

test(
  "legacy mode still returns undefined on success",
  async () => {
    const fixture = createFixture();

    const result = await fixture.run(
      fixture.io
    );

    assert.equal(
      result,
      undefined
    );

    assert.equal(
      fixture.state.emitted.length,
      1
    );
  }
);

test(
  "legacy mode keeps soft failure on board query",
  async () => {
    const fixture = createFixture({
      failGame: true,
    });

    const result = await fixture.run(
      fixture.io
    );

    assert.equal(
      result,
      undefined
    );

    assert.equal(
      fixture.state.emitted.length,
      0
    );
  }
);

test(
  "legacy throwOnError remains compatible",
  async () => {
    const fixture = createFixture({
      emitError: true,
    });

    const result = await fixture.run(
      fixture.io,
      {
        throwOnError: true,
      }
    );

    assert.equal(
      result,
      undefined
    );

    assert.equal(
      fixture.state.emitted.length,
      0
    );
  }
);
