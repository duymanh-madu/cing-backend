"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const http = require("node:http");
const express = require("express");

const ROOT = path.resolve(
  __dirname,
  "../../../.."
);

const ROUTE_SOURCE = fs.readFileSync(
  path.join(
    ROOT,
    "routes/cingGameEconomyV2Routes.js"
  ),
  "utf8"
);

const INDEX_SOURCE = fs.readFileSync(
  path.join(ROOT, "routes/index.js"),
  "utf8"
);

const ENDPOINTS = [
  {
    method: "GET",
    path: "/gifts/catalog",
  },
  {
    method: "POST",
    path: "/revive-credits/points",
  },
  {
    method: "POST",
    path: "/gifts/wallet",
  },
  {
    method: "POST",
    path: "/gifts/points",
  },
  {
    method: "GET",
    path: "/gifts/notifications",
  },
  {
    method: "POST",
    path: "/gifts/notifications/42/read",
  },
];

function loadIsolatedEconomyRouter() {
  const calls = {
    financial: 0,
    catalog: 0,
    database: 0,
  };

  const failFinancial = () => {
    calls.financial += 1;

    throw new Error(
      "FINANCIAL_SERVICE_MUST_NOT_RUN"
    );
  };

  const failCatalog = () => {
    calls.catalog += 1;

    throw new Error(
      "CATALOG_SERVICE_MUST_NOT_RUN"
    );
  };

  const failDatabase = () => {
    calls.database += 1;

    throw new Error(
      "DATABASE_MUST_NOT_BE_ACCESSED"
    );
  };

  const mockSupabase = {
    from: failDatabase,
    rpc: failDatabase,
  };

  const moduleObject = {
    exports: {},
  };

  const mockedRequire = name => {
    if (name === "express") {
      return express;
    }

    if (name === "../supabase") {
      return mockSupabase;
    }

    if (
      name === "../utils/phoneIdentity"
    ) {
      return {
        normalizePhone(input) {
          return String(
            input || ""
          ).trim();
        },
      };
    }

    if (
      name ===
      "../services/games/revival/cingPointsBuyReviveCreditsService"
    ) {
      return {
        buyReviveCreditsWithPoints:
          failFinancial,
      };
    }

    if (
      name ===
      "../services/games/revival/cingGameGiftPurchaseService"
    ) {
      return {
        purchaseGameGift:
          failFinancial,
      };
    }

    if (
      name ===
      "../services/games/revival/cingGameGiftCustomerCatalogService"
    ) {
      return {
        getCustomerGameGiftCatalog:
          failCatalog,
      };
    }

    throw new Error(
      "UNEXPECTED_DEPENDENCY: " + name
    );
  };

  vm.runInNewContext(
    ROUTE_SOURCE,
    {
      module: moduleObject,
      exports: moduleObject.exports,
      require: mockedRequire,

      // No enabled flag is supplied.
      // This is the real default-OFF case.
      process: {
        env: {},
      },

      console,
    },
    {
      filename:
        "routes/cingGameEconomyV2Routes.js",
    }
  );

  function isolatedAuth(
    req,
    res,
    next
  ) {
    if (
      req.headers.authorization !==
      "Bearer isolated-contract-token"
    ) {
      return res.status(401).json({
        success: false,
        code: "ISOLATED_AUTH_REQUIRED",
      });
    }

    req.customer = {
      phone: "0912345678",
    };

    return next();
  }

  const router =
    moduleObject.exports
      .createCingGameEconomyV2Router({
        authMiddleware:
          isolatedAuth,
      });

  return {
    router,
    calls,
  };
}

function requestLocal(
  port,
  method,
  route,
  authenticated
) {
  return new Promise(
    (resolve, reject) => {
      const headers = {};

      if (authenticated) {
        headers.authorization =
          "Bearer isolated-contract-token";
      }

      const request =
        http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: route,
            method,
            headers,
            timeout: 3000,
          },
          response => {
            let body = "";

            response.setEncoding(
              "utf8"
            );

            response.on(
              "data",
              chunk => {
                body += chunk;
              }
            );

            response.on(
              "end",
              () => {
                try {
                  resolve({
                    status:
                      response.statusCode,
                    body:
                      JSON.parse(body),
                  });
                } catch (error) {
                  reject(error);
                }
              }
            );
          }
        );

      request.on(
        "error",
        reject
      );

      request.on(
        "timeout",
        () => {
          request.destroy(
            new Error(
              "LOCAL_HTTP_TIMEOUT"
            )
          );
        }
      );

      request.end();
    }
  );
}

test(
  "all Economy V2 HTTP paths fail closed without database or financial access",
  async () => {
    assert.match(
      INDEX_SOURCE,
      /router\.use\(\s*"\/game\/economy-v2",\s*require\("\.\/cingGameEconomyV2Routes"\)\s*\.createCingGameEconomyV2Router/
    );

    const {
      router,
      calls,
    } =
      loadIsolatedEconomyRouter();

    const app =
      express();

    app.use(
      express.json()
    );

    app.use(
      "/api/game/economy-v2",
      router
    );

    const server =
      http.createServer(
        app
      );

    try {
      await new Promise(
        (resolve, reject) => {
          server.once(
            "error",
            reject
          );

          server.listen(
            0,
            "127.0.0.1",
            resolve
          );
        }
      );

      const address =
        server.address();

      assert.ok(
        address &&
        typeof address === "object"
      );

      const port =
        address.port;

      for (
        const endpoint of
        ENDPOINTS
      ) {
        const route =
          "/api/game/economy-v2" +
          endpoint.path;

        const unauthorized =
          await requestLocal(
            port,
            endpoint.method,
            route,
            false
          );

        assert.equal(
          unauthorized.status,
          401,
          endpoint.method +
          " " +
          route
        );

        assert.equal(
          unauthorized.body.code,
          "ISOLATED_AUTH_REQUIRED"
        );

        const disabled =
          await requestLocal(
            port,
            endpoint.method,
            route,
            true
          );

        assert.equal(
          disabled.status,
          503,
          endpoint.method +
          " " +
          route
        );

        assert.equal(
          disabled.body.code,
          "CING_GAME_ECONOMY_NOT_ENABLED"
        );
      }

      assert.deepEqual(
        calls,
        {
          financial: 0,
          catalog: 0,
          database: 0,
        }
      );
    } finally {
      await new Promise(
        (resolve, reject) => {
          if (
            !server.listening
          ) {
            return resolve();
          }

          server.close(
            error => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            }
          );
        }
      );
    }
  }
);
