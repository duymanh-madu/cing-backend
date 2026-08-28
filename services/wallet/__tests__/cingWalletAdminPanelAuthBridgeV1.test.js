const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const ROOT =
  path.resolve(
    __dirname,
    "../../.."
  );

function read(
  relativePath
) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    "utf8"
  );
}

const middleware =
  read(
    "middlewares/adminPanelPermissionMiddleware.js"
  );

const walletRoute =
  read(
    "routes/adminWalletRoutes.js"
  );

const walletController =
  read(
    "controllers/admin/adminWalletController.js"
  );

const legacyPermission =
  read(
    "middlewares/adminAuthMiddleware.js"
  );

const adminAuth =
  read(
    "routes/adminAuthRoutes.js"
  );


test(
  "Wallet admin auth uses Admin Panel Bearer token contract",
  () => {
    assert.match(
      middleware,
      /authorization/i
    );

    assert.match(
      middleware,
      /Bearer/
    );

    assert.match(
      middleware,
      /jwt\.verify/
    );

    assert.match(
      adminAuth,
      /jwt\.sign/
    );

    assert.match(
      adminAuth,
      /\{\s*id:\s*admin\.id,\s*username:\s*admin\.username,\s*role:\s*admin\.role\s*\}/
    );
  }
);


test(
  "Wallet permission middleware rehydrates active admin authority",
  () => {
    assert.match(
      middleware,
      /\.from\(["']admins["']\)/
    );

    assert.match(
      middleware,
      /\.eq\(\s*["']id["']/
    );

    assert.match(
      middleware,
      /\.eq\(\s*["']active["']\s*,\s*true\s*\)/
    );
  }
);


test(
  "Wallet authorization uses backend role permission config",
  () => {
    assert.match(
      middleware,
      /ROLE_CONFIG/
    );

    assert.match(
      middleware,
      /hasPermission/
    );

    assert.match(
      middleware,
      /roleConfig\.permissions/
    );
  }
);


test(
  "Wallet admin route uses only canonical panel permission middleware",
  () => {
    assert.match(
      walletRoute,
      /adminPanelPermissionMiddleware/
    );

    assert.match(
      walletRoute,
      /requirePanelPermission/
    );

    assert.doesNotMatch(
      walletRoute,
      /adminAuthMiddleware/
    );

    assert.doesNotMatch(
      walletRoute,
      /\brequirePermission\s*\(/
    );
  }
);


test(
  "Wallet keeps three dedicated financial permissions",
  () => {
    for (
      const permission
      of [
        "wallet.promotion.read",
        "wallet.promotion.update",
        "wallet.reporting.read",
      ]
    ) {
      assert.match(
        walletRoute,
        new RegExp(permission)
      );
    }
  }
);


test(
  "Wallet panel authorization never trusts caller identity headers",
  () => {
    assert.doesNotMatch(
      middleware,
      /x-user-id|x-zalo-user-id/i
    );

    assert.doesNotMatch(
      walletController,
      /req\.headers|x-user-id|x-zalo-user-id/i
    );
  }
);


test(
  "legacy header permission middleware remains untouched for existing domains",
  () => {
    assert.match(
      legacyPermission,
      /x-user-id/
    );

    assert.match(
      legacyPermission,
      /x-zalo-user-id/
    );

    assert.match(
      legacyPermission,
      /getAdminRole/
    );
  }
);


test(
  "downstream Wallet actor is hydrated server-side admin identity",
  () => {
    assert.match(
      middleware,
      /req\.admin\s*=\s*permissionAdmin/
    );

    assert.match(
      middleware,
      /id:\s*String\(admin\.id\)/
    );

    assert.match(
      walletController,
      /admin\.id/
    );

    assert.match(
      walletController,
      /String\(actor\)\.trim\(\)/
    );
  }
);


test(
  "unknown role fails closed instead of inheriting super admin",
  () => {
    assert.match(
      middleware,
      /if\s*\(\s*!roleConfig\s*\)/
    );

    assert.match(
      middleware,
      /Admin role not supported/
    );
  }
);
