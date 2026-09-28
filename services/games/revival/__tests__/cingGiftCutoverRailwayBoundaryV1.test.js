"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const root =
  path.resolve(
    __dirname,
    "../../../.."
  );

function read(relative) {
  return fs.readFileSync(
    path.join(
      root,
      relative
    ),
    "utf8"
  );
}

const route = read(
  "routes/cingGameEconomyV2Routes.js"
);

const chess = read(
  "routes/chessRoutes.js"
);

const catalog = read(
  "services/games/revival/cingGameGiftCustomerCatalogService.js"
);

const purchase = read(
  "services/games/revival/cingGameGiftPurchaseService.js"
);

test(
  "customer Catalog uses existing Economy V2 router",
  () => {
    assert.match(
      route,
      /getCustomerGameGiftCatalog/
    );

    assert.match(
      route,
      /"\/gifts\/catalog"/
    );
  }
);

test(
  "Catalog GET requires customer auth and default-off gate",
  () => {
    assert.match(
      route,
      /"\/gifts\/catalog",\s*authMiddleware,\s*disabledGate/
    );

    assert.match(
      route,
      /CING_GAME_ECONOMY_V2_HTTP_ENABLED/
    );
  }
);

test(
  "no hardcoded customer Gift fallback",
  () => {
    assert.doesNotMatch(
      catalog,
      /const GIFTS\s*=/
    );

    assert.match(
      catalog,
      /cing_game_gift_catalog/
    );

    assert.match(
      catalog,
      /\.eq\(\s*"enabled",\s*true/
    );
  }
);

test(
  "customer price comes only from Catalog",
  () => {
    assert.match(
      catalog,
      /row\.price_vnd/
    );

    assert.match(
      catalog,
      /row\.charm_award/
    );

    assert.match(
      catalog,
      /price \/ 1000n/
    );

    assert.doesNotMatch(
      catalog,
      /req\.body/
    );
  }
);

test(
  "customer Catalog service has no financial mutation",
  () => {
    assert.doesNotMatch(
      catalog,
      /\.update\s*\(/
    );

    assert.doesNotMatch(
      catalog,
      /\.insert\s*\(/
    );

    assert.doesNotMatch(
      catalog,
      /\.rpc\s*\(/
    );
  }
);

test(
  "legacy Chess tip has explicit cutover fence",
  () => {
    assert.match(
      chess,
      /CING_GAME_GIFT_V2_CUTOVER_ENABLED === "true"/
    );

    assert.match(
      chess,
      /status\(410\)/
    );

    assert.match(
      chess,
      /LEGACY_GIFT_DISABLED/
    );
  }
);

test(
  "legacy fence precedes immediate success and debit",
  () => {
    const guard =
      chess.indexOf(
        'CING_GAME_GIFT_V2_CUTOVER_ENABLED'
      );

    const tip =
      chess.indexOf(
        'router.post(\n  "/tip",'
      );

    const success =
      chess.indexOf(
        "res.json({ success: true });",
        tip
      );

    const debit =
      chess.indexOf(
        "await deductPoints({",
        tip
      );

    assert.ok(
      tip >= 0
    );

    assert.ok(
      guard > tip
    );

    assert.ok(
      success > guard
    );

    assert.ok(
      debit > success
    );
  }
);

test(
  "original Gift purchasing authority preserved",
  () => {
    assert.match(
      purchase,
      /cing_game_gift_purchase_wallet_v1/
    );

    assert.match(
      purchase,
      /cing_game_gift_purchase_points_v1/
    );

    assert.match(
      route,
      /"\/gifts\/wallet"/
    );

    assert.match(
      route,
      /"\/gifts\/points"/
    );
  }
);

test(
  "customer sender identity remains server owned",
  () => {
    assert.match(
      purchase,
      /customer\?\.phone/
    );

    assert.match(
      route,
      /customer:\s*req\.customer/
    );

    assert.doesNotMatch(
      catalog,
      /fromUserId/
    );
  }
);

test(
  "Economy V2 router mounted with default-OFF gate",
  () => {
    for (
      const relative of [
        "server.js",
        "routes/index.js",
      ]
    ) {
      if (relative === "routes/index.js") {
          assert.match(
            read(relative),
            /cingGameEconomyV2Routes/
          );
          assert.match(
            read(relative),
            /createCingGameEconomyV2Router/
          );
        } else {
          assert.doesNotMatch(
            read(relative),
            /cingGameEconomyV2Routes/
          );
        }
    }
  }
);
