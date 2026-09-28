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

const legacySource = fs.readFileSync(
  path.join(
    ROOT,
    "routes/notificationRoutes.js"
  ),
  "utf8"
);

const profileSource = fs.readFileSync(
  path.join(
    ROOT,
    "routes/profileUpdateRoutes.js"
  ),
  "utf8"
);

function loadLegacyRouter() {
  const middleware = [];

  const routes = [];

  const calls = [];

  const router = {
    use(handler) {
      middleware.push(handler);
    },

    get(route, ...handlers) {
      routes.push({
        method: "GET",
        route,
        handlers,
      });
    },

    post(route, ...handlers) {
      routes.push({
        method: "POST",
        route,
        handlers,
      });
    },
  };

  const mockServices = {
    createNotification() {
      calls.push("create");
    },

    getUserNotifications() {
      calls.push("get");
    },

    markNotificationRead() {
      calls.push("read");
    },

    getUnreadCount() {
      calls.push("unread");
    },

    broadcastNotification() {
      calls.push("broadcast");
    },
  };

  const moduleObject = {
    exports: {},
  };

  vm.runInNewContext(
    legacySource,
    {
      module: moduleObject,
      exports: moduleObject.exports,
      require(name) {
        if (name === "express") {
          return {
            Router: () => router,
          };
        }

        if (
          name ===
          "../services/notificationService"
        ) {
          return mockServices;
        }

        throw new Error(
          "Unexpected dependency: " + name
        );
      },
      console,
    },
    {
      filename:
        "routes/notificationRoutes.js",
    }
  );

  return {
    middleware,
    routes,
    calls,
  };
}

test(
  "legacy fence precedes every HTTP route",
  () => {
    const fencePosition =
      legacySource.indexOf(
        "CING_NOTIFICATION_LEGACY_HTTP_FENCE_V1"
      );

    const firstRoutePosition =
      legacySource.indexOf(
        "router.get("
      );

    assert.ok(
      fencePosition >= 0
    );

    assert.ok(
      firstRoutePosition > fencePosition
    );

    const loaded =
      loadLegacyRouter();

    assert.equal(
      loaded.middleware.length,
      1
    );

    assert.equal(
      loaded.routes.length,
      6
    );
  }
);

test(
  "all legacy HTTP paths return 410 before services",
  () => {
    const loaded =
      loadLegacyRouter();

    const paths = [
      ["GET", "/test"],
      ["GET", "/user/0912345678"],
      ["GET", "/unread/0912345678"],
      ["POST", "/read/42"],
      ["POST", "/create"],
      ["POST", "/broadcast"],
    ];

    for (const [method, url] of paths) {
      let status = 200;
      let payload = null;
      let nextCalled = false;

      const res = {
        status(value) {
          status = value;
          return this;
        },

        json(value) {
          payload = JSON.parse(
            JSON.stringify(value)
          );
          return this;
        },
      };

      loaded.middleware[0](
        {
          method,
          url,
          body: {
            user_id: "0912345678",
            title: "forged",
          },
        },
        res,
        () => {
          nextCalled = true;
        }
      );

      assert.equal(
        status,
        410,
        method + " " + url
      );

      assert.equal(
        payload?.success,
        false
      );

      assert.equal(
        payload?.code,
        "NOTIFICATION_LEGACY_HTTP_GONE"
      );

      assert.equal(
        nextCalled,
        false
      );
    }

    assert.deepEqual(
      loaded.calls,
      []
    );
  }
);

test(
  "legacy Profile GET excludes Gift V2",
  () => {
    const start =
      profileSource.indexOf(
        '"/notifications/:userId"'
      );

    const end =
      profileSource.indexOf(
        '"/notifications/mark-read"',
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const section =
      profileSource.slice(
        start,
        end
      );

    assert.match(
      section,
      /\.neq\("type",\s*"gift_received"\)/
    );

    assert.match(
      section,
      /authMiddleware/
    );
  }
);

test(
  "legacy Profile Mark-Read cannot update Gift V2",
  () => {
    const start =
      profileSource.indexOf(
        '"/notifications/mark-read"'
      );

    const end =
      profileSource.indexOf(
        "NOTIFICATION_MARK_READ_FAILED",
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const section =
      profileSource.slice(
        start,
        end
      );

    assert.match(
      section,
      /\.in\("id",\s*ids\.map\(String\)\)/
    );

    assert.match(
      section,
      /\.eq\("user_id",\s*phone\)/
    );

    assert.match(
      section,
      /\.neq\("type",\s*"gift_received"\)/
    );
  }
);

test(
  "Gift Read and Mark-Read remain separate",
  () => {
    const giftSource =
      fs.readFileSync(
        path.join(
          ROOT,
          "routes/cingGameEconomyV2Routes.js"
        ),
        "utf8"
      );

    assert.match(
      giftSource,
      /CING_GIFT_NOTIFICATION_READ_V1/
    );

    assert.match(
      giftSource,
      /CING_GIFT_NOTIFICATION_MARK_READ_V1/
    );
  }
);
