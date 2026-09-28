"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const express = require("express");
const jwt = require("jsonwebtoken");

test("Offline Revival HTTP authority", async (t) => {
  const root = path.resolve(__dirname, "../../../..");

  const customerPath = require.resolve(
    path.join(
      root,
      "repositories/customer/customerRepository"
    )
  );

  const servicePath = require.resolve(
    path.join(
      root,
      "services/games/revival/cingOfflineReviveService"
    )
  );

  const limiterPath = require.resolve(
    path.join(root, "middlewares/rateLimiter")
  );

  const authPath = require.resolve(
    path.join(root, "middlewares/authMiddleware")
  );

  const routerPath = require.resolve(
    path.join(root, "routes/cingOfflineReviveRoutes")
  );

  const paths = [
    customerPath,
    servicePath,
    limiterPath,
    authPath,
    routerPath,
  ];

  const previous = new Map(
    paths.map((file) => [file, require.cache[file]])
  );

  const previousSecret = process.env.JWT_SECRET;
  const secret = "cing-local-revival-route-test-only";

  process.env.JWT_SECRET = secret;

  const customer = {
    id: "local-customer-001",
    phone: "0912345678",
  };

  const sessionId =
    "11111111-1111-4111-8111-111111111111";

  const requestId =
    "22222222-2222-4222-8222-222222222222";

  const calls = [];
  const customerLookups = [];

  let serviceFailure = null;
  let server;

  function mockModule(filename, exports) {
    const fake = new Module(filename);
    fake.filename = filename;
    fake.loaded = true;
    fake.exports = exports;
    require.cache[filename] = fake;
  }

  function makeOperation(name) {
    return async (args) => {
      calls.push({ name, args });

      if (serviceFailure) {
        throw serviceFailure;
      }

      return {
        applied: true,
        session_id: sessionId,
        operation: name,
      };
    };
  }

  try {
    mockModule(customerPath, {
      async findById(id) {
        customerLookups.push(id);

        return id === customer.id
          ? customer
          : null;
      },
    });

    const limiter = (_req, _res, next) => next();

    mockModule(limiterPath, {
      gameScoreLimiter: limiter,
    });

    mockModule(servicePath, {
      startOfflineRevival:
        makeOperation("start"),

      enterOfflineRevivePending:
        makeOperation("pending"),

      purchaseOfflineRevival:
        makeOperation("revive"),
      finalizeOfflineRevival:
        makeOperation("finalize"),
    });

    delete require.cache[authPath];
    delete require.cache[routerPath];

    const router = require(routerPath);

    const routes = router.stack.filter(
      (layer) => layer.route
    );

    assert.deepEqual(
      routes.map((layer) => layer.route.path),
      [
        "/price",
        "/balance",
        "/session/recover/:request_id",
        "/session",
        "/session/:session_id/pending",
        "/session/:session_id/revive",
        "/session/:session_id/finalize",
      ]
    );

    assert.deepEqual(
      routes.map((layer) => layer.route.stack.length),
      [2, 2, 2, 2, 3, 3, 3]
    );

    const app = express();

    app.use(express.json());
    app.use("/test-revival", router);

    server = await new Promise(
      (resolve, reject) => {
        const instance = app.listen(
          0,
          "127.0.0.1",
          () => resolve(instance)
        );

        instance.once("error", reject);
      }
    );

    const base =
      `http://127.0.0.1:${server.address().port}`;

    const token = jwt.sign(
      { customerId: customer.id },
      secret
    );

    async function post(
      route,
      body,
      authorization
    ) {
      const headers = {
        "Content-Type": "application/json",
      };

      if (authorization) {
        headers.Authorization = authorization;
      }

      const response = await fetch(
        base + "/test-revival" + route,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        }
      );

      return {
        status: response.status,
        body: await response.json(),
      };
    }

    function reset() {
      calls.length = 0;
      customerLookups.length = 0;
      serviceFailure = null;
    }

    await t.test(
      "missing JWT is rejected before service",
      async () => {
        reset();

        const result = await post(
          "/session",
          {
            request_id: requestId,
            game_key: "black-pearl-rush",
          }
        );

        assert.equal(result.status, 401);
        assert.equal(calls.length, 0);
      }
    );

    await t.test(
      "invalid JWT is rejected before service",
      async () => {
        reset();

        const result = await post(
          "/session",
          {
            request_id: requestId,
            game_key: "black-pearl-rush",
          },
          "Bearer invalid-token"
        );

        assert.equal(result.status, 401);
        assert.equal(calls.length, 0);
      }
    );

    await t.test(
      "JWT with missing customer is rejected",
      async () => {
        reset();

        const missingToken = jwt.sign(
          { customerId: "nonexistent-customer" },
          secret
        );

        const result = await post(
          "/session",
          {
            request_id: requestId,
            game_key: "black-pearl-rush",
          },
          `Bearer ${missingToken}`
        );

        assert.equal(result.status, 401);
        assert.equal(calls.length, 0);
      }
    );

    await t.test(
      "valid JWT starts session using req.customer",
      async () => {
        reset();

        const result = await post(
          "/session",
          {
            request_id: requestId,
            game_key: "black-pearl-rush",
            user_id: "forged-user",
          },
          `Bearer ${token}`
        );

        assert.equal(result.status, 200);
        assert.equal(result.body.success, true);

        assert.deepEqual(calls, [{
          name: "start",
          args: {
            customer,
            requestId,
            gameKey: "black-pearl-rush",
          },
        }]);

        assert.deepEqual(
          customerLookups,
          [customer.id]
        );
      }
    );

    await t.test(
      "pending forwards only allowed fields",
      async () => {
        reset();

        const result = await post(
          `/session/${sessionId}/pending`,
          {
            request_id: requestId,
            expected_event_seq: 0,
            reason: "death",
            user_id: "forged-user",
            credit_cost: 0,
          },
          `Bearer ${token}`
        );

        assert.equal(result.status, 200);

        assert.deepEqual(calls, [{
          name: "pending",
          args: {
            customer,
            sessionId,
            requestId,
            expectedEventSeq: 0,
            reason: "death",
          },
        }]);
      }
    );

    await t.test(
      "revive never forwards client credit cost",
      async () => {
        reset();

        const result = await post(
          `/session/${sessionId}/revive`,
          {
            request_id: requestId,
            expected_event_seq: 1,
            pending_event_id:
              "9223372036854775807",
            credit_cost: 0,
            user_id: "forged-user",
          },
          `Bearer ${token}`
        );

        assert.equal(result.status, 200);

        assert.deepEqual(calls, [{
          name: "revive",
          args: {
            customer,
            sessionId,
            requestId,
            expectedEventSeq: 1,
            pendingEventId:
              "9223372036854775807",
          },
        }]);
      }
    );


    await t.test(
      "finalize rejects missing JWT before service",
      async () => {
        reset();

        const result = await post(
          `/session/${sessionId}/finalize`,
          {
            request_id: requestId,
            expected_event_seq: 1,
            final_score: 500,
            final_best_combo: 12,
          }
        );

        assert.equal(result.status, 401);
        assert.equal(calls.length, 0);
        assert.equal(customerLookups.length, 0);
      }
    );

    await t.test(
      "finalize rejects invalid JWT before service",
      async () => {
        reset();

        const result = await post(
          `/session/${sessionId}/finalize`,
          {
            request_id: requestId,
            expected_event_seq: 1,
            final_score: 500,
            final_best_combo: 12,
          },
          "Bearer invalid-token"
        );

        assert.equal(result.status, 401);
        assert.equal(calls.length, 0);
      }
    );

    await t.test(
      "finalize forwards only authorized fields",
      async () => {
        reset();

        const result = await post(
          `/session/${sessionId}/finalize`,
          {
            request_id: requestId,
            expected_event_seq: 1,
            final_score: 500,
            final_best_combo: 12,
            player_name: "Tower Player",
            avatar: "https://example.test/avatar.png",

            user_id: "forged-user",
            game_key: "chess",
            score_id: 999999,
            credit_cost: 0,
            applied: true,
          },
          `Bearer ${token}`
        );

        assert.equal(result.status, 200);
        assert.equal(result.body.success, true);
        assert.equal(
          result.body.data.operation,
          "finalize"
        );

        assert.deepEqual(calls, [
          {
            name: "finalize",
            args: {
              customer,
              sessionId,
              requestId,
              expectedEventSeq: 1,
              finalScore: 500,
              finalBestCombo: 12,
              playerName: "Tower Player",
              avatar:
                "https://example.test/avatar.png",
            },
          },
        ]);

        assert.deepEqual(
          customerLookups,
          [customer.id]
        );
      }
    );

    await t.test(
      "finalize preserves zero score and combo",
      async () => {
        reset();

        const result = await post(
          `/session/${sessionId}/finalize`,
          {
            request_id: requestId,
            expected_event_seq: 1,
            final_score: 0,
            final_best_combo: 0,
          },
          `Bearer ${token}`
        );

        assert.equal(result.status, 200);

        assert.deepEqual(calls, [
          {
            name: "finalize",
            args: {
              customer,
              sessionId,
              requestId,
              expectedEventSeq: 1,
              finalScore: 0,
              finalBestCombo: 0,
              playerName: undefined,
              avatar: undefined,
            },
          },
        ]);
      }
    );

    await t.test(
      "finalize business conflict returns HTTP 409",
      async () => {
        reset();

        const error = new Error(
          "REVIVAL_SESSION_ALREADY_FINALIZED"
        );

        error.code =
          "REVIVAL_SESSION_ALREADY_FINALIZED";

        error.statusCode = 409;
        serviceFailure = error;

        const result = await post(
          `/session/${sessionId}/finalize`,
          {
            request_id: requestId,
            expected_event_seq: 1,
            final_score: 500,
            final_best_combo: 12,
          },
          `Bearer ${token}`
        );

        assert.equal(result.status, 409);
        assert.equal(
          result.body.code,
          "REVIVAL_SESSION_ALREADY_FINALIZED"
        );
        assert.equal(calls.length, 1);
      }
    );

    await t.test(
      "finalize hides unexpected database errors",
      async () => {
        reset();

        serviceFailure = new Error(
          "private finalize database details"
        );

        const result = await post(
          `/session/${sessionId}/finalize`,
          {
            request_id: requestId,
            expected_event_seq: 1,
            final_score: 500,
            final_best_combo: 12,
          },
          `Bearer ${token}`
        );

        assert.equal(result.status, 500);

        assert.equal(
          result.body.code,
          "REVIVAL_FINALIZE_FAILED"
        );

        assert.equal(
          result.body.message,
          "Không thể xử lý yêu cầu hồi sinh"
        );

        assert.doesNotMatch(
          JSON.stringify(result.body),
          /private finalize database details/
        );

        assert.equal(calls.length, 1);
      }
    );

    await t.test(
      "business error returns HTTP 409 once",
      async () => {
        reset();

        const error = new Error(
          "INSUFFICIENT_REVIVE_CREDITS"
        );

        error.code =
          "INSUFFICIENT_REVIVE_CREDITS";
        error.statusCode = 409;

        serviceFailure = error;

        const result = await post(
          `/session/${sessionId}/revive`,
          {
            request_id: requestId,
            expected_event_seq: 1,
            pending_event_id: "3",
          },
          `Bearer ${token}`
        );

        assert.equal(result.status, 409);
        assert.equal(
          result.body.code,
          "INSUFFICIENT_REVIVE_CREDITS"
        );
        assert.equal(calls.length, 1);
      }
    );

    await t.test(
      "unexpected error hides database details",
      async () => {
        reset();

        serviceFailure = new Error(
          "private database implementation detail"
        );

        const result = await post(
          "/session",
          {
            request_id: requestId,
            game_key: "cing-stack-tower",
          },
          `Bearer ${token}`
        );

        assert.equal(result.status, 500);
        assert.equal(
          result.body.code,
          "REVIVAL_SESSION_START_FAILED"
        );
        assert.equal(
          result.body.message,
          "Không thể xử lý yêu cầu hồi sinh"
        );
        assert.equal(calls.length, 1);
      }
    );

  } finally {
    if (server) {
      await new Promise(
        (resolve, reject) =>
          server.close((error) =>
            error ? reject(error) : resolve()
          )
      );
    }

    for (const filename of paths) {
      delete require.cache[filename];

      const old = previous.get(filename);

      if (old) {
        require.cache[filename] = old;
      }
    }

    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});
