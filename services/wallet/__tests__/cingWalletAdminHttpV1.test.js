const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT =
  path.resolve(__dirname, "../../..");

function read(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8"
  );
}

const route =
  read("routes/adminWalletRoutes.js");

const controller =
  read(
    "controllers/admin/adminWalletController.js"
  );

const service =
  read(
    "services/wallet/walletAdminService.js"
  );

const routeIndex =
  read("routes/index.js");

const roleService =
  read("services/adminRoleService.js");

test(
  "wallet admin router is mounted under canonical admin boundary",
  () => {
    assert.match(
      routeIndex,
      /["']\/admin\/wallet["']/
    );

    assert.match(
      routeIndex,
      /require\(["']\.\/adminWalletRoutes["']\)/
    );
  }
);

test(
  "wallet admin endpoints require dedicated permissions",
  () => {
    assert.match(
      route,
      /wallet\.promotion\.read/
    );

    assert.match(
      route,
      /wallet\.promotion\.update/
    );

    assert.match(
      route,
      /wallet\.reporting\.read/
    );

    assert.match(
      route,
      /requirePanelPermission/
    );
  }
);

test(
  "super admin wildcard remains compatible with wallet permissions",
  () => {
    assert.match(
      roleService,
      /permissions\.includes\(\s*["']\*["']\s*\)/
    );

    assert.match(
      roleService,
      /return permissions\.includes\(\s*permission\s*\)/
    );
  }
);

test(
  "wallet admin actor comes only from authenticated admin context",
  () => {
    const actorStart =
      controller.indexOf(
        "function resolveActorId"
      );

    const actorEnd =
      controller.indexOf(
        "function mapWalletError",
        actorStart
      );

    assert.ok(actorStart >= 0);
    assert.ok(actorEnd > actorStart);

    const actorBlock =
      controller.slice(
        actorStart,
        actorEnd
      );

    assert.match(
      actorBlock,
      /req\.admin/
    );

    assert.doesNotMatch(
      actorBlock,
      /req\.headers/
    );

    assert.doesNotMatch(
      actorBlock,
      /x-user-id|x-zalo-user-id/i
    );
  }
);

test(
  "wallet admin service uses only bounded wallet RPC authorities",
  () => {
    assert.match(
      service,
      /cing_wallet_get_topup_promotion_v1/
    );

    assert.match(
      service,
      /cing_wallet_admin_configure_topup_promotion_v1/
    );

    assert.match(
      service,
      /cing_wallet_admin_summary_v1/
    );

    assert.doesNotMatch(
      service,
      /\.from\s*\(/
    );
  }
);

test(
  "promotion update rejects unknown client fields",
  () => {
    assert.match(
      controller,
      /allowedKeys/
    );

    for (
      const field
      of [
        "enabled",
        "name",
        "starts_at",
        "ends_at",
        "tiers",
      ]
    ) {
      assert.match(
        controller,
        new RegExp(
          `["']${field}["']`
        )
      );
    }

    assert.match(
      controller,
      /CING_WALLET_PROMOTION_BODY_INVALID/
    );
  }
);

test(
  "promotion tiers reject non-positive unsafe and duplicate thresholds",
  () => {
    assert.match(
      controller,
      /Number\.isSafeInteger/
    );

    assert.match(
      controller,
      /value <= 0/
    );

    assert.match(
      controller,
      /9223372036854775807n/
    );

    assert.match(
      controller,
      /CING_WALLET_PROMOTION_TIER_DUPLICATE/
    );
  }
);

test(
  "enabled promotion cannot be submitted without tiers",
  () => {
    assert.match(
      controller,
      /enabled\s*&&\s*normalizedTiers\.length === 0/
    );

    assert.match(
      controller,
      /CING_WALLET_PROMOTION_ENABLED_WITHOUT_TIERS/
    );
  }
);

test(
  "admin HTTP layer contains no direct wallet financial mutation",
  () => {
    const combined =
      `${route}\n${controller}\n${service}`;

    assert.doesNotMatch(
      combined,
      /cing_wallet_apply_mutation_private/
    );

    assert.doesNotMatch(
      combined,
      /cing_wallet_settle_verified_topup_atomic/
    );

    assert.doesNotMatch(
      combined,
      /cing_wallet_purchase_game_plays_atomic/
    );
  }
);
