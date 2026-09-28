"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const {
  createRequire,
} = require("node:module");

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

const service = read(
  "services/games/revival/cingReviveCreditAdminPriceService.js"
);

const route = read(
  "routes/cingReviveCreditAdminPriceRoutes.js"
);

const sql = read(
  "db/migrations/20260926_cing_revive_credit_admin_price_authority_v1.sql"
);

test(
  "service resolves real Supabase module path",
  () => {
    const fromService =
      createRequire(
        path.join(
          root,
          "services/games/revival/cingReviveCreditAdminPriceService.js"
        )
      );

    assert.ok(
      fromService.resolve(
        "../../../supabase"
      )
    );
  }
);

test(
  "uses exact Admin price RPC",
  () => {
    assert.match(
      service,
      /cing_revive_credit_admin_set_price_v1/
    );

    assert.match(
      service,
      /p_actor_id:/
    );

    assert.match(
      service,
      /p_request_id:/
    );

    assert.match(
      service,
      /p_price_vnd:/
    );
  }
);

test(
  "uses only canonical app config row",
  () => {
    assert.match(
      service,
      /\.from\("app_configs"\)/
    );

    assert.match(
      service,
      /\.eq\("id", 1\)/
    );

    assert.match(
      sql,
      /where id = 1/i
    );
  }
);

test(
  "no direct Admin price UPDATE from JavaScript",
  () => {
    assert.doesNotMatch(
      service,
      /\.update\s*\(/
    );

    assert.doesNotMatch(
      service,
      /\.upsert\s*\(/
    );

    assert.doesNotMatch(
      service,
      /\.insert\s*\(/
    );
  }
);

test(
  "NULL is explicit purchase disable",
  () => {
    assert.match(
      service,
      /value === null/
    );

    assert.match(
      route,
      /hasOwnProperty\.call/
    );

    assert.match(
      route,
      /REVIVE_ADMIN_PRICE_REQUIRED/
    );
  }
);

test(
  "VND to points conversion is exact",
  () => {
    assert.match(
      service,
      /price % 1000n !== 0n/
    );

    assert.match(
      service,
      /BigInt\(price\) \/ 1000n/
    );
  }
);

test(
  "Admin router has explicit default-off gate",
  () => {
    assert.match(
      route,
      /CING_REVIVE_ADMIN_PRICE_HTTP_ENABLED/
    );

    assert.match(
      route,
      /!==\s*"true"/
    );

    assert.match(
      route,
      /REVIVE_ADMIN_PRICE_NOT_ENABLED/
    );
  }
);

test(
  "both routes require Super Admin",
  () => {
    const matches =
      route.match(
        /authMiddleware,\s*requireSuperAdmin,\s*disabledGate/g
      ) || [];

    assert.equal(
      matches.length,
      2
    );
  }
);

test(
  "router factory fails without Admin authority",
  () => {
    assert.match(
      route,
      /typeof authMiddleware !== "function"/
    );

    assert.match(
      route,
      /typeof requireSuperAdmin !== "function"/
    );

    assert.match(
      route,
      /typeof resolveAdminActor !== "function"/
    );
  }
);

test(
  "Admin actor cannot be supplied by client",
  () => {
    assert.match(
      route,
      /resolveAdminActor\(\s*req\s*\)/
    );

    assert.doesNotMatch(
      route,
      /actorId:\s*req\.body/
    );
  }
);

test(
  "service verifies Admin receipt",
  () => {
    assert.match(
      service,
      /REVIVE_ADMIN_RECEIPT_INVALID/
    );

    assert.match(
      service,
      /data\.request_id !== request/
    );

    assert.match(
      service,
      /receiptPrice !== price/
    );

    assert.match(
      service,
      /data\.enabled !==/
    );
  }
);

test(
  "router remains unmounted",
  () => {
    for (
      const relative of [
        "server.js",
        "routes/index.js",
        "routes/appConfigRoutes.js",
      ]
    ) {
      const source =
        read(relative);

      assert.doesNotMatch(
        source,
        /cingReviveCreditAdminPriceRoutes/
      );
    }
  }
);

test(
  "does not change Gift / Chess / Wallet",
  () => {
    assert.doesNotMatch(
      route,
      /\/tip/
    );

    assert.doesNotMatch(
      service,
      /deductPoints/
    );

    assert.doesNotMatch(
      service,
      /cing_wallet_apply_mutation_private/
    );
  }
);
