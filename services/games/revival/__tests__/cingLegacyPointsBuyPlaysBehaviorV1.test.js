"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../../../routes/pointsRoutes.js"),
  "utf8"
);

const start = source.indexOf(
  'router.post("/buy-plays", async (req, res) => {'
);

const end = source.indexOf(
  "// POST /api/points/deduct",
  start
);

assert.ok(start >= 0, "buy-plays route missing");
assert.ok(end > start, "route boundary missing");

const routeSource = source.slice(start, end);

function createHarness(options = {}) {
  const calls = {
    debit: 0,
    read: 0,
    credit: 0,
    analytics: 0,
  };

  let handler;

  const router = {
    post(route, callback) {
      assert.equal(route, "/buy-plays");
      handler = callback;
    },
  };

  const supabase = {
    from(table) {
      assert.equal(table, "players");

      return {
        select(column) {
          assert.equal(column, "game_plays");

          return {
            eq(field, value) {
              assert.equal(field, "user_id");
              assert.equal(value, "0900000000");

              return {
                async maybeSingle() {
                  calls.read++;

                  if (options.readError) {
                    return {
                      data: null,
                      error: {
                        message: "SIMULATED_READ_FAILURE",
                      },
                    };
                  }

                  return {
                    data: {
                      game_plays: 10,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },

        update(payload) {
          calls.credit++;

          assert.deepEqual(
            JSON.parse(JSON.stringify(payload)),
            { game_plays: 12 }
          );

          return {
            eq(field, value) {
              assert.equal(field, "user_id");
              assert.equal(value, "0900000000");

              return {
                eq(balanceField, balance) {
                  assert.equal(balanceField, "game_plays");
                  assert.equal(balance, 10);

                  return {
                    select(column) {
                      assert.equal(column, "game_plays");

                      return {
                        async maybeSingle() {
                          if (options.creditError) {
                            return {
                              data: null,
                              error: {
                                message: "SIMULATED_CREDIT_FAILURE",
                              },
                            };
                          }

                          if (options.casConflict) {
                            return {
                              data: null,
                              error: null,
                            };
                          }

                          return {
                            data: {
                              game_plays: 12,
                            },
                            error: null,
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  async function deductPoints() {
    calls.debit++;

    if (options.debitError) {
      throw new Error(
        "SIMULATED_DEBIT_AMBIGUITY"
      );
    }

    return {
      success: true,
      remaining: 90,
    };
  }

  const context = {
    router,
    supabase,
    deductPoints,
    POINTS_PER_PLAY: 5,

    rejectLegacyGamePlaysMutation(req, res) {
      if (!options.closed) {
        return false;
      }

      res.status(410).json({
        success: false,
        code: "CING_LEGACY_GAME_PLAYS_CLOSED",
      });

      return true;
    },

    require(name) {
      assert.equal(
        name,
        "../services/loyaltyPointService"
      );

      return {
        async addPlays() {
          calls.analytics++;
        },
      };
    },

    console: {
      error() {},
    },
  };

  vm.runInNewContext(
    routeSource,
    context,
    {
      filename: "isolated-buy-plays-route.js",
      timeout: 1000,
    }
  );

  assert.equal(typeof handler, "function");

  async function invoke(quantity = 2) {
    const response = {
      statusCode: 200,
      body: null,

      status(code) {
        this.statusCode = code;
        return this;
      },

      json(body) {
        this.body = body;
        return this;
      },
    };

    await handler(
      {
        body: {
          user_id: "0900000000",
          phone: "0900000000",
          quantity,
        },
      },
      response
    );

    return response;
  }

  return {
    calls,
    invoke,
  };
}

test(
  "closed HTTP guard prevents any debit",
  async () => {
    const h = createHarness({
      closed: true,
    });

    const res = await h.invoke();

    assert.equal(res.statusCode, 410);
    assert.equal(h.calls.debit, 0);
    assert.equal(h.calls.credit, 0);
  }
);

test(
  "invalid quantity is rejected before debit",
  async () => {
    const h = createHarness();

    const res = await h.invoke(-1);

    assert.equal(res.statusCode, 400);
    assert.equal(
      res.body.code,
      "CING_LEGACY_PLAY_QUANTITY_INVALID"
    );
    assert.equal(h.calls.debit, 0);
  }
);

test(
  "ambiguous debit never returns success",
  async () => {
    const h = createHarness({
      debitError: true,
    });

    const res = await h.invoke();

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.success, false);
    assert.equal(h.calls.debit, 1);
    assert.equal(h.calls.credit, 0);
    assert.equal(h.calls.analytics, 0);
  }
);

test(
  "player read failure after debit requires review",
  async () => {
    const h = createHarness({
      readError: true,
    });

    const res = await h.invoke();

    assert.equal(res.statusCode, 409);
    assert.equal(h.calls.debit, 1);
    assert.equal(h.calls.read, 1);
    assert.equal(h.calls.credit, 0);
  }
);

test(
  "database credit failure requires review",
  async () => {
    const h = createHarness({
      creditError: true,
    });

    const res = await h.invoke();

    assert.equal(res.statusCode, 409);
    assert.equal(h.calls.debit, 1);
    assert.equal(h.calls.credit, 1);
    assert.equal(h.calls.analytics, 0);
  }
);

test(
  "compare-and-set conflict requires review",
  async () => {
    const h = createHarness({
      casConflict: true,
    });

    const res = await h.invoke();

    assert.equal(res.statusCode, 409);
    assert.equal(h.calls.debit, 1);
    assert.equal(h.calls.credit, 1);
    assert.equal(h.calls.analytics, 0);
  }
);

test(
  "confirmed debit and credit return success",
  async () => {
    const h = createHarness();

    const res = await h.invoke();

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.plays_added, 2);
    assert.equal(res.body.data.points_spent, 10);
    assert.equal(res.body.data.new_plays, 12);

    assert.equal(h.calls.debit, 1);
    assert.equal(h.calls.read, 1);
    assert.equal(h.calls.credit, 1);
    assert.equal(h.calls.analytics, 1);
  }
);
