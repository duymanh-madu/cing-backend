"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const route =
  fs.readFileSync(
    "routes/adminAuthRoutes.js",
    "utf8"
  );

test(
  "cashier account creation requires canonical store binding",
  () => {
    assert.match(
      route,
      /STORE_BOUND_ROLES[\s\S]*"cashier"/
    );

    assert.match(
      route,
      /ADMIN_CASHIER_STORE_REQUIRED/
    );

    assert.match(
      route,
      /cing_wallet_pos_stores/
    );

    assert.match(
      route,
      /\.eq\([\s\S]*"active"[\s\S]*true/
    );
  }
);

test(
  "non Counter operational roles cannot acquire Cing Pay store binding",
  () => {
    assert.match(
      route,
      /ADMIN_STORE_ROLE_NOT_ALLOWED/
    );

    assert.match(
      route,
      /normalizedRole !==[\s\S]*"cashier"[\s\S]*normalizedRole !==[\s\S]*"super_admin"/
    );
  }
);

test(
  "Super Admin can update only account role and canonical store binding",
  () => {
    assert.match(
      route,
      /router\.put\([\s\S]*"\/account\/:id"/
    );

    assert.match(
      route,
      /new Set\(\[[\s\S]*"role"[\s\S]*"store_id"[\s\S]*\]\)/
    );

    assert.match(
      route,
      /ADMIN_SUPER_ADMIN_REQUIRED/
    );
  }
);

test(
  "account list projects canonical store without password",
  () => {
    assert.match(
      route,
      /store:cing_wallet_pos_stores!admins_cing_wallet_pos_store_fk/
    );

    assert.doesNotMatch(
      route,
      /\.select\([\s\S]{0,160}"password"/
    );
  }
);

test(
  "store selector source is active canonical registry only",
  () => {
    assert.match(
      route,
      /"\/stores"/
    );

    assert.match(
      route,
      /\.from\([\s\S]*"cing_wallet_pos_stores"/
    );

    assert.match(
      route,
      /\.eq\([\s\S]*"active"[\s\S]*true/
    );
  }
);

test(
  "cashier account API never accepts POS identity",
  () => {
    const createStart =
      route.indexOf(
        'router.post("/create"'
      );

    const passwordStart =
      route.indexOf(
        '// PUT /api/admin/auth/change-password',
        createStart
      );

    assert.ok(
      createStart >= 0 &&
      passwordStart > createStart
    );

    const region =
      route.slice(
        createStart,
        passwordStart
      );

    assert.doesNotMatch(
      region,
      /pos_parent|pos_id/
    );
  }
);
