"use strict";

const fs =
  require("node:fs");
const path =
  require("node:path");
const test =
  require("node:test");
const assert =
  require("node:assert/strict");

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

const migration =
  read(
    "db/migrations/20260912_cing_wallet_super_admin_customer_lookup_v1.sql"
  );

const mirror =
  read(
    "supabase/migrations/20260912161500_cing_wallet_super_admin_customer_lookup_v1.sql"
  );

const service =
  read(
    "services/wallet/walletAdminService.js"
  );

const controller =
  read(
    "controllers/admin/adminWalletController.js"
  );

const route =
  read(
    "routes/adminWalletRoutes.js"
  );

test(
  "customer lookup migration mirrors are byte-identical",
  () => {
    assert.equal(
      mirror,
      migration
    );
  }
);

test(
  "customer lookup is bounded service-role read authority",
  () => {
    assert.match(
      migration,
      /cing_wallet_admin_customer_lookup_v1/
    );

    assert.match(
      migration,
      /left join[\s\S]*public\.cing_wallet_accounts/i
    );

    assert.match(
      migration,
      /limit 20/i
    );

    assert.match(
      migration,
      /grant execute[\s\S]*to service_role/i
    );
  }
);

test(
  "customer lookup never mutates Wallet financial state",
  () => {
    assert.doesNotMatch(
      migration,
      /\b(update|insert|delete)\b[\s\S]*public\.cing_wallet_(accounts|transactions)/i
    );

    assert.doesNotMatch(
      migration,
      /cing_wallet_apply_mutation_private/
    );
  }
);

test(
  "missing Wallet account projects zero without creating account",
  () => {
    assert.match(
      migration,
      /coalesce\(\s*wa\.balance,\s*0\s*\)/i
    );

    assert.match(
      migration,
      /wa\.user_id is not null/i
    );
  }
);

test(
  "customer lookup route is adjustment-permission protected",
  () => {
    assert.match(
      route,
      /router\.get\(\s*"\/customers"/
    );

    assert.match(
      route,
      /wallet\.balance\.adjust/
    );

    assert.match(
      route,
      /getAdjustmentCustomers/
    );
  }
);

test(
  "customer lookup controller explicitly requires super admin",
  () => {
    assert.match(
      controller,
      /async function getAdjustmentCustomers/
    );

    assert.match(
      controller,
      /req\.admin\?\.role\s*!==\s*"super_admin"/
    );

    assert.match(
      controller,
      /CING_WALLET_SUPER_ADMIN_REQUIRED/
    );
  }
);

test(
  "customer lookup projects canonical Wallet balance safely",
  () => {
    assert.match(
      controller,
      /wallet_balance/
    );

    assert.match(
      controller,
      /Number\.isSafeInteger/
    );

    assert.match(
      controller,
      /balance < 0/
    );

    assert.match(
      controller,
      /wallet_account_exists/
    );
  }
);

test(
  "wallet admin service remains bounded-RPC only",
  () => {
    assert.match(
      service,
      /cing_wallet_admin_customer_lookup_v1/
    );

    assert.doesNotMatch(
      service,
      /\.from\s*\(/
    );
  }
);
