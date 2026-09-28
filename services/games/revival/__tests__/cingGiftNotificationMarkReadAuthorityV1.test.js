"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../../../..");

const ROUTE_FILE = path.join(
  ROOT,
  "routes/cingGameEconomyV2Routes.js"
);

function loadRouter({
  enabled = true,
  row = { id: "42" },
  dbError = null,
} = {}) {
  const source = fs.readFileSync(
    ROUTE_FILE,
    "utf8"
  );

  const routes = new Map();
  const calls = [];

  const router = {
    get(url, ...handlers) {
      routes.set(`GET ${url}`, handlers);
    },

    post(url, ...handlers) {
      routes.set(`POST ${url}`, handlers);
    },
  };

  const query = {
    update(value) {
      calls.push(["update", value]);
      return this;
    },

    eq(key, value) {
      calls.push(["eq", key, value]);
      return this;
    },

    contains(key, value) {
      calls.push(["contains", key, value]);
      return this;
    },

    select(value) {
      calls.push(["select", value]);
      return this;
    },

    async maybeSingle() {
      calls.push(["maybeSingle"]);
      return {
        data: row,
        error: dbError,
      };
    },
  };

  const supabase = {
    from(table) {
      calls.push(["from", table]);
      return query;
    },
  };

  const mockedRequire = (name) => {
    if (name === "express") {
      return {
        Router: () => router,
      };
    }

    if (name === "../supabase") {
      return supabase;
    }

    if (name === "../utils/phoneIdentity") {
      return {
        normalizePhone(value) {
          if (
            typeof value !== "string"
          ) {
            return "";
          }

          return value.startsWith("84")
            ? "0" + value.slice(2)
            : value;
        },
      };
    }

    if (
      name ===
      "../services/games/revival/cingPointsBuyReviveCreditsService"
    ) {
      return {
        buyReviveCreditsWithPoints() {},
      };
    }

    if (
      name ===
      "../services/games/revival/cingGameGiftPurchaseService"
    ) {
      return {
        purchaseGameGift() {},
      };
    }

    if (
      name ===
      "../services/games/revival/cingGameGiftCustomerCatalogService"
    ) {
      return {
        getCustomerGameGiftCatalog() {},
      };
    }

    throw new Error(
      `Unexpected dependency: ${name}`
    );
  };

  const moduleObject = {
    exports: {},
  };

  vm.runInNewContext(
    source,
    {
      module: moduleObject,
      exports: moduleObject.exports,
      require: mockedRequire,
      process: {
        env: {
          CING_GAME_ECONOMY_V2_HTTP_ENABLED:
            enabled ? "true" : "false",
        },
      },
      console,
    },
    {
      filename: ROUTE_FILE,
    }
  );

  const mockAuth = (
    req,
    res,
    next
  ) => {
    if (!req.customer) {
      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
      });

      return;
    }

    next();
  };

  moduleObject.exports
    .createCingGameEconomyV2Router({
      authMiddleware: mockAuth,
    });

  return {
    routes,
    calls,
  };
}

async function execute(
  setup,
  {
    customer = {
      phone: "0912345678",
    },
    id = "42",
    body = {},
  } = {}
) {
  const handlers = setup.routes.get(
    "POST /gifts/notifications/:notificationId/read"
  );

  assert.ok(
    handlers,
    "mark-read route must exist"
  );

  let status = 200;
  let payload;

  const req = {
    customer,
    params: {
      notificationId: id,
    },
    body,
  };

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

  for (const handler of handlers) {
    let calledNext = false;

    await handler(
      req,
      res,
      () => {
        calledNext = true;
      }
    );

    if (!calledNext) {
      break;
    }
  }

  return {
    status,
    payload,
  };
}

function selector(
  calls,
  key
) {
  const match = calls.find(
    (call) =>
      call[0] === "eq" &&
      call[1] === key
  );

  return match?.[2];
}

test(
  "mark-read is authenticated, gated and scoped to recipient",
  async () => {
    const setup = loadRouter();

    const result = await execute(
      setup,
      {
        customer: {
          phone: "0912345678",
        },
        id: "42",
        body: {
          userId: "0999999999",
        },
      }
    );

    assert.equal(
      result.status,
      200
    );

    assert.equal(
      result.payload.success,
      true
    );

    assert.equal(
      result.payload.data.id,
      "42"
    );

    assert.equal(
      selector(
        setup.calls,
        "user_id"
      ),
      "0912345678"
    );

    assert.equal(
      selector(
        setup.calls,
        "id"
      ),
      "42"
    );

    assert.equal(
      selector(
        setup.calls,
        "type"
      ),
      "gift_received"
    );

    const metadata = setup.calls.find(
      (call) =>
        call[0] === "contains" &&
        call[1] === "metadata"
    );

    assert.equal(
      metadata?.[2]?.source,
      "cing_game_gift_purchase_v1"
    );

    assert.equal(
      setup.calls.filter(
        (call) =>
          call[0] === "update"
      ).length,
      1
    );

    assert.equal(
      setup.calls[0][1],
      "notifications"
    );
  }
);

test(
  "no auth causes no database access",
  async () => {
    const setup = loadRouter();

    const result = await execute(
      setup,
      {
        customer: null,
      }
    );

    assert.equal(
      result.status,
      401
    );

    assert.equal(
      setup.calls.length,
      0
    );
  }
);

test(
  "default-off gate causes no database access",
  async () => {
    const setup = loadRouter({
      enabled: false,
    });

    const result = await execute(
      setup
    );

    assert.equal(
      result.status,
      503
    );

    assert.equal(
      setup.calls.length,
      0
    );
  }
);

test(
  "invalid notification ID is rejected",
  async () => {
    for (
      const id of [
        "",
        "0",
        "-1",
        "1 OR 1=1",
        "9223372036854775808",
        "01",
      ]
    ) {
      const setup = loadRouter();

      const result = await execute(
        setup,
        { id }
      );

      assert.equal(
        result.status,
        400,
        `ID ${JSON.stringify(id)}`
      );

      assert.equal(
        setup.calls.length,
        0
      );
    }
  }
);

test(
  "missing or wrong-owner row is not reported as read",
  async () => {
    const setup = loadRouter({
      row: null,
    });

    const result = await execute(
      setup
    );

    assert.equal(
      result.status,
      404
    );

    assert.equal(
      result.payload.code,
      "GAME_GIFT_NOTIFICATION_NOT_FOUND"
    );
  }
);

test(
  "read failure is not reported as success",
  async () => {
    const setup = loadRouter({
      row: null,
      dbError: new Error(
        "mock database failure"
      ),
    });

    const result = await execute(
      setup
    );

    assert.equal(
      result.payload.success,
      false
    );

    assert.notEqual(
      result.status,
      200
    );
  }
);

test(
  "read route contains no financial mutation",
  () => {
    const source = fs.readFileSync(
      ROUTE_FILE,
      "utf8"
    );

    const start = source.indexOf(
      "CING_GIFT_NOTIFICATION_MARK_READ_V1"
    );

    const end = source.indexOf(
      "  return router;",
      start
    );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const section = source.slice(
      start,
      end
    );

    assert.doesNotMatch(
      section,
      /\.rpc\(|\.insert\(|\.delete\(/
    );

    assert.doesNotMatch(
      section,
      /cing_wallet|point_transactions|charm_balance/i
    );

    assert.match(
      section,
      /\.update\(\s*\{\s*is_read:\s*true/
    );
  }
);
