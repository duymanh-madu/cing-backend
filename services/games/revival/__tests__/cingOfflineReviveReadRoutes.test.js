"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const express = require("express");
const jwt = require("jsonwebtoken");

test(
  "Revival GET routes enforce authenticated reads",
  async (t) => {
    const root = path.resolve(
      __dirname,
      "../../../.."
    );

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
      path.join(
        root,
        "middlewares/rateLimiter"
      )
    );

    const authPath = require.resolve(
      path.join(
        root,
        "middlewares/authMiddleware"
      )
    );

    const routePath = require.resolve(
      path.join(
        root,
        "routes/cingOfflineReviveRoutes"
      )
    );

    const paths = [
      customerPath,
      servicePath,
      limiterPath,
      authPath,
      routePath,
    ];

    const previous = new Map(
      paths.map(
        (file) => [
          file,
          require.cache[file],
        ]
      )
    );

    const previousSecret =
      process.env.JWT_SECRET;

    const secret =
      "cing-local-read-http-test-only";

    process.env.JWT_SECRET =
      secret;

    const customer = {
      id: "local-read-customer",
      phone: "0912345678",
    };

    const requestId =
      "11111111-1111-4111-8111-111111111111";

    const calls = [];

    let failure = null;
    let server = null;

    function mock(filename, exports) {
      const fake =
        new Module(filename);

      fake.filename =
        filename;

      fake.loaded = true;
      fake.exports = exports;

      require.cache[filename] =
        fake;
    }

    function operation(name) {
      return async (args) => {
        calls.push({
          name,
          args,
        });

        if (failure) {
          throw failure;
        }

        if (name === "balance") {
          return {
            balance: 31,
          };
        }

        return {
          session_id:
            "22222222-2222-4222-8222-222222222222",

          session_status:
            "revive_pending",

          pending_event: {
            event_id:
              "9007199254740993",

            event_seq: 1,
            reason: "death",
          },
        };
      };
    }

    const forbidden = () => {
      throw new Error(
        "Read route invoked mutation"
      );
    };

    try {
      mock(
        customerPath,
        {
          async findById(id) {
            return id === customer.id
              ? customer
              : null;
          },
        }
      );

      mock(
        limiterPath,
        {
          gameScoreLimiter:
            (_req, _res, next) =>
              next(),
        }
      );

      mock(
        servicePath,
        {
          getOfflineReviveCreditBalance:
            operation("balance"),

          recoverOfflineRevival:
            operation("recover"),

          startOfflineRevival:
            forbidden,

          enterOfflineRevivePending:
            forbidden,

          purchaseOfflineRevival:
            forbidden,

          finalizeOfflineRevival:
            forbidden,
        }
      );

      delete require.cache[authPath];
      delete require.cache[routePath];

      const router =
        require(routePath);

      const getRoutes =
        router.stack
          .filter(
            (layer) =>
              layer.route &&
              layer.route.methods.get
          )
          .map(
            (layer) =>
              layer.route.path
          );

      assert.deepEqual(
        getRoutes,
        [
          "/price",
          "/balance",
          "/session/recover/:request_id",
        ]
      );

      const app =
        express();

      app.use(
        "/test-revival",
        router
      );

      server =
        await new Promise(
          (resolve, reject) => {
            const instance =
              app.listen(
                0,
                "127.0.0.1",
                () =>
                  resolve(instance)
              );

            instance.once(
              "error",
              reject
            );
          }
        );

      const base =
        "http://127.0.0.1:" +
        server.address().port +
        "/test-revival";

      const token =
        jwt.sign(
          {
            customerId:
              customer.id,
          },
          secret
        );

      async function get(
        route,
        authorization
      ) {
        const headers = {};

        if (authorization) {
          headers.Authorization =
            authorization;
        }

        const response =
          await fetch(
            base + route,
            {
              headers,

              signal:
                AbortSignal.timeout(
                  5000
                ),
            }
          );

        return {
          status:
            response.status,

          body:
            await response.json(),
        };
      }

      function reset() {
        calls.length = 0;
        failure = null;
      }

      await t.test(
        "balance rejects missing JWT",
        async () => {
          reset();

          const response =
            await get(
              "/balance"
            );

          assert.equal(
            response.status,
            401
          );

          assert.equal(
            calls.length,
            0
          );
        }
      );

      await t.test(
        "recovery rejects missing JWT",
        async () => {
          reset();

          const response =
            await get(
              "/session/recover/" +
              requestId
            );

          assert.equal(
            response.status,
            401
          );

          assert.equal(
            calls.length,
            0
          );
        }
      );

      await t.test(
        "invalid JWT rejected",
        async () => {
          reset();

          const response =
            await get(
              "/balance",
              "Bearer invalid-token"
            );

          assert.equal(
            response.status,
            401
          );

          assert.equal(
            calls.length,
            0
          );
        }
      );

      await t.test(
        "missing customer rejected",
        async () => {
          reset();

          const tokenMissing =
            jwt.sign(
              {
                customerId:
                  "missing-customer",
              },
              secret
            );

          const response =
            await get(
              "/balance",
              "Bearer " +
              tokenMissing
            );

          assert.equal(
            response.status,
            401
          );

          assert.equal(
            calls.length,
            0
          );
        }
      );

      await t.test(
        "balance uses authenticated customer",
        async () => {
          reset();

          const response =
            await get(
              "/balance?user_id=foreign",
              "Bearer " + token
            );

          assert.equal(
            response.status,
            200
          );

          assert.deepEqual(
            response.body,
            {
              success: true,

              data: {
                balance: 31,
              },
            }
          );

          assert.deepEqual(
            calls,
            [
              {
                name: "balance",

                args: {
                  customer,
                },
              },
            ]
          );
        }
      );

      await t.test(
        "recovery preserves bigint and request ID",
        async () => {
          reset();

          const response =
            await get(
              "/session/recover/" +
              requestId +
              "?user_id=foreign",
              "Bearer " + token
            );

          assert.equal(
            response.status,
            200
          );

          assert.deepEqual(
            calls,
            [
              {
                name: "recover",

                args: {
                  customer,
                  requestId,
                },
              },
            ]
          );

          assert.equal(
            response.body.data
              .pending_event
              .event_id,
            "9007199254740993"
          );
        }
      );

      await t.test(
        "missing session returns 404",
        async () => {
          reset();

          failure =
            new Error(
              "Không tìm thấy phiên chơi"
            );

          failure.code =
            "REVIVAL_SESSION_NOT_FOUND";

          failure.statusCode =
            404;

          const response =
            await get(
              "/session/recover/" +
              requestId,
              "Bearer " + token
            );

          assert.equal(
            response.status,
            404
          );

          assert.equal(
            response.body.code,
            "REVIVAL_SESSION_NOT_FOUND"
          );
        }
      );

      await t.test(
        "balance errors hide database details",
        async () => {
          reset();

          failure =
            new Error(
              "private balance SQL"
            );

          const response =
            await get(
              "/balance",
              "Bearer " + token
            );

          assert.equal(
            response.status,
            500
          );

          assert.equal(
            response.body.code,
            "REVIVAL_BALANCE_READ_FAILED"
          );

          assert.doesNotMatch(
            JSON.stringify(
              response.body
            ),
            /private balance SQL/
          );
        }
      );

      await t.test(
        "recovery errors hide database details",
        async () => {
          reset();

          failure =
            new Error(
              "private recovery SQL"
            );

          const response =
            await get(
              "/session/recover/" +
              requestId,
              "Bearer " + token
            );

          assert.equal(
            response.status,
            500
          );

          assert.equal(
            response.body.code,
            "REVIVAL_SESSION_RECOVERY_FAILED"
          );

          assert.doesNotMatch(
            JSON.stringify(
              response.body
            ),
            /private recovery SQL/
          );
        }
      );

    } finally {
      if (server) {
        await new Promise(
          (resolve, reject) => {
            server.close(
              (error) =>
                error
                  ? reject(error)
                  : resolve()
            );
          }
        );
      }

      for (const file of paths) {
        const original =
          previous.get(file);

        if (original) {
          require.cache[file] =
            original;
        } else {
          delete require.cache[file];
        }
      }

      if (
        previousSecret === undefined
      ) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET =
          previousSecret;
      }
    }
  }
);
