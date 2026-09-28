"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

const sql = read(
  "db/migrations/20260926_cing_game_gift_catalog_admin_authority_v1.sql"
);

const mirror = read(
  "supabase/migrations/20260926015000_cing_game_gift_catalog_admin_authority_v1.sql"
);

const service = read(
  "services/games/revival/cingGameGiftCatalogAdminService.js"
);

const route = read(
  "routes/cingGameGiftCatalogAdminRoutes.js"
);

test(
  "Admin SQL migration mirror exact",
  () => {
    assert.equal(
      sql,
      mirror
    );
  }
);

test(
  "reuses existing Gift Catalog",
  () => {
    assert.match(
      sql,
      /insert into\s+public\.cing_game_gift_catalog/i
    );

    assert.doesNotMatch(
      sql,
      /create table\s+public\.cing_game_gift_catalog\s*\(/i
    );
  }
);

test(
  "audit and catalog mutation share one transaction",
  () => {
    assert.match(
      sql,
      /^begin\s*;/i
    );

    assert.match(
      sql,
      /create table\s+public\.cing_game_gift_catalog_admin_audit/i
    );

    assert.match(
      sql,
      /insert into\s+public\.cing_game_gift_catalog_admin_audit/i
    );

    assert.match(
      sql,
      /commit\s*;\s*$/i
    );
  }
);

test(
  "Admin request ID is durable and serialized",
  () => {
    assert.match(
      sql,
      /request_id uuid primary key/i
    );

    assert.match(
      sql,
      /pg_advisory_xact_lock/i
    );

    assert.match(
      sql,
      /GAME_GIFT_ADMIN_REQUEST_CONFLICT/i
    );
  }
);

test(
  "VND price converts to points exactly",
  () => {
    assert.match(
      sql,
      /mod\(\s*p_price_vnd,\s*1000\s*\)\s*<>\s*0/i
    );

    assert.match(
      sql,
      /p_price_vnd\s*\/\s*1000/i
    );

    assert.match(
      service,
      /BigInt\(price\)\s*\/\s*1000n/
    );
  }
);

test(
  "Admin cannot directly mutate Catalog",
  () => {
    assert.doesNotMatch(
      service,
      /\.update\s*\(/
    );

    assert.doesNotMatch(
      service,
      /\.upsert\s*\(/
    );

    assert.match(
      service,
      /cing_game_gift_catalog_admin_upsert_v1/
    );
  }
);

test(
  "Admin RPC remains dormant",
  () => {
    const executable =
      sql.replace(
        /\/\*[\s\S]*?\*\//g,
        ""
      );

    assert.doesNotMatch(
      executable,
      /\bgrant execute\b/i
    );

    assert.match(
      executable,
      /revoke all\s+on function\s+public\.cing_game_gift_catalog_admin_upsert_v1/i
    );
  }
);

test(
  "both Admin routes require Super Admin",
  () => {
    const count =
      (
        route.match(
          /authMiddleware,\s*requireSuperAdmin,\s*disabledGate/g
        ) || []
      ).length;

    assert.equal(
      count,
      2
    );
  }
);

test(
  "Admin router cannot be built without authority",
  () => {
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
  "Admin actor is server-derived",
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
  "Gift Admin mounts only in Admin assembly; Chess legacy remains unchanged",
  () => {
    const admin =
      read("routes/adminRoutes.js");

    assert.match(
      admin,
      /cingGameGiftCatalogAdminRoutes/
    );

    assert.match(
      admin,
      /"\/game-economy\/gifts"/
    );

    assert.match(
      admin,
      /gift\.catalog\.manage/
    );

    for (
      const relative of [
        "server.js",
        "routes/index.js",
        "routes/appConfigRoutes.js",
        "routes/chessRoutes.js",
      ]
    ) {
      const text =
        read(relative);

      assert.doesNotMatch(
        text,
        /cingGameGiftCatalogAdminRoutes/
      );
    }
  }
);

test(
  "no catalog seed and no Gift activation",
  () => {
    assert.doesNotMatch(
      sql,
      /insert into\s+public\.cing_game_gift_catalog\s*\([^)]*\)\s*values\s*\(\s*'cafe_nau'/i
    );

    assert.doesNotMatch(
      route,
      /\/tip/
    );
  }
);
