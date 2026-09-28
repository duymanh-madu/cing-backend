"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");

const ROOT = path.resolve(__dirname, "../../../..");
const SECRET = "synthetic-revive-history-test-secret";

const A = {
  id: "customer-a",
  phone: "0912345678",
  zalo_id: "zalo-a",
};

const B = {
  id: "customer-b",
  phone: "0987654321",
  zalo_id: "zalo-b",
};

function load(file, imports) {
  const mod = { exports: {} };

  vm.runInNewContext(
    fs.readFileSync(
      path.join(ROOT, file),
      "utf8"
    ),
    {
      module: mod,
      exports: mod.exports,
      require(name) {
        if (!Object.hasOwn(imports, name)) {
          throw new Error(
            "UNEXPECTED_IMPORT:" + name
          );
        }
        return imports[name];
      },
      process: {
        env: { JWT_SECRET: SECRET },
      },
      console,
      Buffer,
      Date,
      Error,
      Number,
      String,
      Set,
    },
    {
      filename: file,
      timeout: 1500,
    }
  );

  return mod.exports;
}

function fixture() {
  const state = {
    customer: A,
    playerZaloId: A.zalo_id,
    playerMissing: false,
    playerError: null,
    historyError: null,
    customerReads: 0,
    playerReads: 0,
    historyReads: 0,
    historyIds: null,
  };

  const repository = {
    async findById(id) {
      state.customerReads++;

      return state.customer?.id === id
        ? state.customer
        : null;
    },
  };

  const auth = load(
    "middlewares/authMiddleware.js",
    {
      jsonwebtoken: jwt,
      "../repositories/customer/customerRepository":
        repository,
    }
  );

  const supabase = {
    from(table) {
      if (table === "players") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    state.playerReads++;

                    return {
                      data: state.playerMissing
                        ? null
                        : {
                            user_id: A.phone,
                            zalo_user_id:
                              state.playerZaloId,
                          },
                      error: state.playerError,
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "analytics_events") {
        return {
          select() {
            return {
              in(field, ids) {
                state.historyIds = ids;

                return {
                  eq() {
                    return {
                      order() {
                        return {
                          async limit() {
                            state.historyReads++;

                            return {
                              data: [
                                {
                                  user_id: A.phone,
                                  event_name:
                                    "revive_credits_added",
                                  event_data: {
                                    amount: 4,
                                  },
                                  metadata: {
                                    reference_type:
                                      "daily_mission_revive_v2",
                                    reference_id:
                                      "synthetic-mission",
                                  },
                                  created_at:
                                    "2026-09-24T00:00:00Z",
                                },
                              ],
                              error:
                                state.historyError,
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
      }

      throw new Error(
        "UNEXPECTED_TABLE:" + table
      );
    },
  };

  const routes = load(
    "routes/profileUpdateRoutes.js",
    {
      express,
      multer,
      "../supabase": supabase,
      "../services/loyaltyPointService": {
        deductPoints() {
          throw new Error(
            "MUTATION_NOT_ALLOWED"
          );
        },
      },
      "../utils/phoneIdentity":
        require(
          "../../../../utils/phoneIdentity"
        ),
      "../middlewares/authMiddleware": auth,
    }
  );

  const app = express();
  app.use("/profile-update", routes);

  function token(customerId = A.id) {
    return jwt.sign(
      { customerId },
      SECRET,
      { expiresIn: "1h" }
    );
  }

  return {
    app,
    state,
    token,
  };
}

async function withServer(run) {
  const h = fixture();

  const server = await new Promise(
    (resolve, reject) => {
      const s = h.app.listen(
        0,
        "127.0.0.1",
        () => resolve(s)
      );

      s.once("error", reject);
    }
  );

  const port = server.address().port;

  async function request(
    userId,
    bearer
  ) {
    const headers = {};

    if (bearer !== undefined) {
      headers.authorization =
        "Bearer " + bearer;
    }

    const response = await fetch(
      `http://127.0.0.1:${port}/profile-update/revive-credits-history/${userId}`,
      { headers }
    );

    return {
      status: response.status,
      body: await response.json(),
    };
  }

  try {
    await run({
      ...h,
      request,
    });
  } finally {
    await new Promise(
      (resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }
    );
  }
}

test(
  "missing and invalid JWT never query history",
  async () => {
    await withServer(async (h) => {
      for (const bearer of [
        undefined,
        "invalid-token",
        h.token("missing-customer"),
      ]) {
        const response =
          await h.request(
            A.phone,
            bearer
          );

        assert.equal(
          response.status,
          401
        );
      }

      assert.equal(
        h.state.playerReads,
        0
      );

      assert.equal(
        h.state.historyReads,
        0
      );
    });
  }
);

test(
  "authenticated owner reads only own Credit history",
  async () => {
    await withServer(async (h) => {
      for (const phone of [
        A.phone,
        "84912345678",
      ]) {
        const response =
          await h.request(
            phone,
            h.token()
          );

        assert.equal(
          response.status,
          200
        );

        assert.equal(
          response.body.success,
          true
        );

        assert.equal(
          response.body.data.length,
          1
        );
      }

      assert.equal(
        h.state.historyReads,
        2
      );

      assert.deepEqual(
        Array.from(
          h.state.historyIds
        ).sort(),
        [
          A.phone,
          "84912345678",
          A.zalo_id,
        ].sort()
      );
    });
  }
);

test(
  "cross-account URL is forbidden before database read",
  async () => {
    await withServer(async (h) => {
      const response =
        await h.request(
          B.phone,
          h.token()
        );

      assert.equal(
        response.status,
        403
      );

      assert.equal(
        response.body.code,
        "REVIVE_HISTORY_FORBIDDEN"
      );

      assert.equal(
        h.state.playerReads,
        0
      );

      assert.equal(
        h.state.historyReads,
        0
      );
    });
  }
);

test(
  "missing canonical customer identity fails closed",
  async () => {
    for (const changed of [
      {
        ...A,
        phone: "",
      },
      {
        ...A,
        zalo_id: "",
      },
    ]) {
      await withServer(async (h) => {
        h.state.customer =
          changed;

        const response =
          await h.request(
            A.phone,
            h.token()
          );

        assert.equal(
          response.status,
          403
        );

        assert.equal(
          response.body.code,
          "REVIVE_HISTORY_IDENTITY_REQUIRED"
        );

        assert.equal(
          h.state.historyReads,
          0
        );
      });
    }
  }
);

test(
  "mismatched player Zalo identity is forbidden",
  async () => {
    await withServer(async (h) => {
      h.state.playerZaloId =
        B.zalo_id;

      const response =
        await h.request(
          A.phone,
          h.token()
        );

      assert.equal(
        response.status,
        403
      );

      assert.equal(
        response.body.code,
        "REVIVE_HISTORY_IDENTITY_MISMATCH"
      );

      assert.equal(
        h.state.historyReads,
        0
      );
    });
  }
);

test(
  "player lookup error does not leak history",
  async () => {
    await withServer(async (h) => {
      h.state.playerError =
        new Error(
          "SYNTHETIC_PLAYER_ERROR"
        );

      const response =
        await h.request(
          A.phone,
          h.token()
        );

      assert.equal(
        response.status,
        500
      );

      assert.equal(
        h.state.historyReads,
        0
      );
    });
  }
);

test(
  "history query failure cannot report success",
  async () => {
    await withServer(async (h) => {
      h.state.historyError =
        new Error(
          "SYNTHETIC_HISTORY_ERROR"
        );

      const response =
        await h.request(
          A.phone,
          h.token()
        );

      assert.equal(
        response.status,
        500
      );

      assert.equal(
        response.body.success,
        false
      );
    });
  }
);

test(
  "missing player refuses history",
  async () => {
    await withServer(async (h) => {
      h.state.playerMissing = true;

      const response =
        await h.request(
          A.phone,
          h.token()
        );

      assert.equal(
        response.status,
        403
      );

      assert.equal(
        response.body.code,
        "REVIVE_HISTORY_IDENTITY_MISMATCH"
      );

      assert.equal(
        h.state.historyReads,
        0
      );
    });
  }
);

test(
  "empty player Zalo ID refuses history",
  async () => {
    await withServer(async (h) => {
      h.state.playerZaloId = "";

      const response =
        await h.request(
          A.phone,
          h.token()
        );

      assert.equal(
        response.status,
        403
      );

      assert.equal(
        response.body.code,
        "REVIVE_HISTORY_IDENTITY_MISMATCH"
      );

      assert.equal(
        h.state.historyReads,
        0
      );
    });
  }
);
