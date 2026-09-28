"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const vm =
  require("node:vm");

const {
  createRequire,
} = require("node:module");

const root =
  path.resolve(
    __dirname,
    "../../../.."
  );

const servicePath =
  path.join(
    root,
    "services/games/revival/cingGameGiftPurchaseService.js"
  );

const routePath =
  path.join(
    root,
    "routes/cingGameEconomyV2Routes.js"
  );

const service =
  fs.readFileSync(
    servicePath,
    "utf8"
  );

const route =
  fs.readFileSync(
    routePath,
    "utf8"
  );

const requestId =
  "11111111-1111-4111-8111-111111111111";

const walletId =
  "22222222-2222-4222-8222-222222222222";

function harness() {
  const calls = [];

  let response = {
    data: null,
    error: null,
  };

  const mocks = {
    "../../../supabase": {
      async rpc(
        name,
        args
      ) {
        calls.push({
          name,
          args,
        });

        return response;
      },
    },

    "../../../utils/phoneIdentity": {
      normalizePhone(value) {
        return [
          "0900000000",
          "0911111111",
        ].includes(value)
          ? value
          : "";
      },
    },
  };

  const module = {
    exports: {},
  };

  const localRequire =
    createRequire(
      servicePath
    );

  vm.runInNewContext(
    service,
    {
      module,
      exports:
        module.exports,

      require(name) {
        if (
          Object.prototype.hasOwnProperty.call(
            mocks,
            name
          )
        ) {
          return mocks[name];
        }

        return localRequire(
          name
        );
      },

      Number,
      String,
      BigInt,
      Error,
    },
    {
      filename:
        servicePath,
    }
  );

  return {
    purchase:
      module.exports.purchaseGameGift,

    calls,

    setResponse(value) {
      response = value;
    },
  };
}

function input(
  fundingSource = "points",
  overrides = {}
) {
  return {
    customer: {
      phone:
        "0900000000",
    },

    recipientUserId:
      "0911111111",

    giftId:
      "flower",

    requestId,

    fundingSource,

    ...overrides,
  };
}

function receipt(
  fundingSource
) {
  return {
    applied: true,

    request_id:
      requestId,

    sender_user_id:
      "0900000000",

    recipient_user_id:
      "0911111111",

    gift_id:
      "flower",

    gift_name:
      "Hoa",

    gift_icon:
      "🌸",

    funding_source:
      fundingSource,

    price_vnd:
      "5000",

    points_cost:
      fundingSource === "points"
        ? 5
        : null,

    charm_awarded:
      10,

    charm_balance_after:
      "110",

    points_balance_after:
      fundingSource === "points"
        ? 95
        : null,

    wallet_transaction_id:
      fundingSource === "wallet"
        ? walletId
        : null,

    ipos_sync_status:
      fundingSource === "points"
        ? "pending"
        : "not_required",
  };
}

test(
  "Gift service resolves real backend module paths",
  () => {
    const fromService =
      createRequire(
        servicePath
      );

    assert.equal(
      fromService.resolve(
        "../../../supabase"
      ),

      require.resolve(
        path.join(
          root,
          "supabase"
        )
      )
    );

    assert.equal(
      fromService.resolve(
        "../../../utils/phoneIdentity"
      ),

      require.resolve(
        path.join(
          root,
          "utils/phoneIdentity"
        )
      )
    );
  }
);

test(
  "wallet rail uses canonical sender and exact RPC",
  async () => {
    const h =
      harness();

    h.setResponse({
      data:
        receipt("wallet"),

      error:
        null,
    });

    const result =
      await h.purchase(
        input("wallet")
      );

    assert.equal(
      result.applied,
      true
    );

    assert.equal(
      result.price_vnd,
      "5000"
    );

    assert.equal(
      h.calls.length,
      1
    );

    assert.equal(
      h.calls[0].name,
      "cing_game_gift_purchase_wallet_v1"
    );

    assert.equal(
      h.calls[0].args.p_sender_user_id,
      "0900000000"
    );

    assert.equal(
      h.calls[0].args.p_request_id,
      requestId
    );

    assert.equal(
      h.calls[0].args.p_recipient_user_id,
      "0911111111"
    );
  }
);

test(
  "points rail uses separate exact RPC",
  async () => {
    const h =
      harness();

    h.setResponse({
      data:
        receipt("points"),

      error:
        null,
    });

    const result =
      await h.purchase(
        input("points")
      );

    assert.equal(
      result.points_cost,
      5
    );

    assert.equal(
      result.ipos_sync_status,
      "pending"
    );

    assert.equal(
      h.calls[0].name,
      "cing_game_gift_purchase_points_v1"
    );
  }
);

test(
  "client-supplied price and charm do not reach RPC",
  async () => {
    const h =
      harness();

    h.setResponse({
      data:
        receipt("points"),

      error:
        null,
    });

    await h.purchase({
      ...input(),
      price_vnd:
        1,

      charm_awarded:
        999999,

      sender_user_id:
        "0999999999",
    });

    assert.deepEqual(
      Object.keys(
        h.calls[0].args
      ).sort(),
      [
        "p_gift_id",
        "p_recipient_user_id",
        "p_request_id",
        "p_sender_user_id",
      ]
    );
  }
);

test(
  "invalid sender is rejected before financial RPC",
  async () => {
    const h =
      harness();

    await assert.rejects(
      h.purchase(
        input(
          "points",
          {
            customer: {
              phone: "",
            },
          }
        )
      ),
      {
        code:
          "GAME_GIFT_AUTH_REQUIRED",
      }
    );

    assert.equal(
      h.calls.length,
      0
    );
  }
);

test(
  "self-gift is rejected before financial RPC",
  async () => {
    const h =
      harness();

    await assert.rejects(
      h.purchase(
        input(
          "points",
          {
            recipientUserId:
              "0900000000",
          }
        )
      ),
      {
        code:
          "GAME_GIFT_SELF_GIFT_FORBIDDEN",
      }
    );

    assert.equal(
      h.calls.length,
      0
    );
  }
);

test(
  "inconsistent historical receipt fails closed",
  async () => {
    const h =
      harness();

    h.setResponse({
      data: {
        ...receipt("points"),

        points_cost:
          1,
      },

      error:
        null,
    });

    await assert.rejects(
      h.purchase(
        input()
      ),
      {
        code:
          "GAME_GIFT_RECEIPT_INVALID",
      }
    );
  }
);

test(
  "funding rail mismatch fails closed",
  async () => {
    const h =
      harness();

    h.setResponse({
      data:
        receipt("wallet"),

      error:
        null,
    });

    await assert.rejects(
      h.purchase(
        input("points")
      ),
      {
        code:
          "GAME_GIFT_RECEIPT_INVALID",
      }
    );
  }
);

test(
  "route owns explicit default-off feature gate",
  () => {
    assert.match(
      route,
      /process\.env\[ENABLE_FLAG\]\s*!==\s*"true"/
    );

    assert.match(
      route,
      /CING_GAME_ECONOMY_NOT_ENABLED/
    );
  }
);

test(
  "all four POST routes require auth and disabled gate",
  () => {
    for (
      const endpoint of [
        "/revive-credits/points",
        "/gifts/wallet",
        "/gifts/points",
      ]
    ) {
      assert.ok(
        route.includes(
          `"${endpoint}"`
        )
      );
    }

    const protectedRoutes =
      route.match(
        /router\.post\(\s*"[^"]+",\s*authMiddleware,\s*disabledGate/g
      ) || [];

    const protectedPaths =
      protectedRoutes.map(
        declaration =>
          declaration.match(
            /"([^"]+)"/
          )[1]
      );

    assert.deepEqual(
      protectedPaths,
      [
        "/revive-credits/points",
        "/gifts/wallet",
        "/gifts/points",
        "/gifts/notifications/:notificationId/read",
      ]
    );
  }
);

test(
  "Gift funding cannot be selected from request body",
  () => {
    assert.match(
      route,
      /fundingSource:\s*"wallet"/
    );

    assert.match(
      route,
      /fundingSource:\s*"points"/
    );

    assert.doesNotMatch(
      route,
      /fundingSource:\s*req\.body/
    );
  }
);

test(
  "router mounts only through authenticated default-OFF assembly",
  () => {
    for (
      const relative of [
        "server.js",
        "routes/index.js",
      ]
    ) {
      const file =
        path.join(
          root,
          relative
        );

      if (
        !fs.existsSync(file)
      ) {
        continue;
      }

      const source =
        fs.readFileSync(
          file,
          "utf8"
        );

      if (file.endsWith("routes/index.js")) {
          assert.match(
            source,
            /cingGameEconomyV2Routes/
          );
          assert.match(
            source,
            /createCingGameEconomyV2Router/
          );
        } else {
          assert.doesNotMatch(
            source,
            /cingGameEconomyV2Routes/
          );
          assert.doesNotMatch(
            source,
            /createCingGameEconomyV2Router/
          );
        }
    }
  }
);

test(
  "existing Chess route is not replaced",
  () => {
    const chess =
      fs.readFileSync(
        path.join(
          root,
          "routes/chessRoutes.js"
        ),
        "utf8"
      );

    assert.match(
      chess,
      /router\.post\(\s*"\/tip"/
    );

    assert.doesNotMatch(
      route,
      /\/tip/
    );
  }
);
