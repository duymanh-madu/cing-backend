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
    "db/migrations/20260912_cing_wallet_super_admin_adjustment_v1.sql"
  );

const mirroredMigration =
  read(
    "supabase/migrations/20260912153000_cing_wallet_super_admin_adjustment_v1.sql"
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
  "migration mirrors are byte-identical",
  () => {
    assert.equal(
      mirroredMigration,
      migration
    );
  }
);

test(
  "bounded adjustment RPC exists and is service-role only",
  () => {
    assert.match(
      migration,
      /cing_wallet_admin_adjust_balance_atomic_v1/
    );

    for (
      const role
      of [
        "public",
        "anon",
        "authenticated",
      ]
    ) {
      assert.match(
        migration,
        new RegExp(
          `revoke all[\\s\\S]*cing_wallet_admin_adjust_balance_atomic_v1[\\s\\S]*from ${role}`,
          "i"
        )
      );
    }

    assert.match(
      migration,
      /grant execute[\s\S]*cing_wallet_admin_adjust_balance_atomic_v1[\s\S]*to service_role/i
    );
  }
);

test(
  "adjustment authority delegates balance mutation to canonical private primitive",
  () => {
    assert.match(
      migration,
      /cing_wallet_apply_mutation_private\s*\(/
    );

    assert.doesNotMatch(
      migration,
      /update\s+public\.cing_wallet_accounts/i
    );

    assert.doesNotMatch(
      migration,
      /insert\s+into\s+public\.cing_wallet_transactions/i
    );
  }
);

test(
  "adjustment ledger is explicitly admin_adjustment with admin actor",
  () => {
    assert.match(
      migration,
      /p_transaction_type\s*=>\s*'admin_adjustment'/
    );

    assert.match(
      migration,
      /p_actor_type\s*=>\s*'admin'/
    );

    assert.match(
      migration,
      /p_actor_id\s*=>\s*v_actor_id/
    );
  }
);

test(
  "request UUID creates durable idempotency identity",
  () => {
    assert.match(
      migration,
      /wallet_admin_adjustment:/
    );

    assert.match(
      migration,
      /pg_advisory_xact_lock/
    );

    assert.match(
      migration,
      /idempotency_key/
    );
  }
);

test(
  "same request with changed financial semantics fails closed",
  () => {
    assert.match(
      migration,
      /CING_WALLET_ADMIN_ADJUSTMENT_REPLAY_CONFLICT/
    );

    assert.match(
      migration,
      /v_existing\.user_id/
    );

    assert.match(
      migration,
      /v_existing\.amount/
    );

    assert.match(
      migration,
      /v_existing\.reason/
    );

    assert.match(
      migration,
      /v_existing\.actor_id/
    );
  }
);

test(
  "credit and debit are converted to signed ledger mutation server-side",
  () => {
    assert.match(
      migration,
      /when v_direction = 'credit'[\s\S]*then p_amount[\s\S]*else -p_amount/
    );

    assert.match(
      migration,
      /v_direction not in\s*\([\s\S]*'credit'[\s\S]*'debit'/
    );
  }
);

test(
  "admin HTTP exposes one bounded adjustment endpoint",
  () => {
    assert.match(
      route,
      /router\.post\(\s*"\/adjustments"/
    );

    assert.match(
      route,
      /wallet\.balance\.adjust/
    );

    assert.match(
      route,
      /createAdjustment/
    );
  }
);

test(
  "controller requires explicit super_admin even after permission middleware",
  () => {
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
  "client cannot provide actor identity or balance result",
  () => {
    const start =
      controller.indexOf(
        "async function createAdjustment"
      );

    const end =
      controller.indexOf(
        "function mapWalletError",
        start
      );

    assert.ok(
      start >= 0
    );

    assert.ok(
      end > start
    );

    const block =
      controller.slice(
        start,
        end
      );

    assert.match(
      block,
      /resolveActorId\(req\)/
    );

    assert.doesNotMatch(
      block,
      /req\.body\.actor/
    );

    assert.doesNotMatch(
      block,
      /balance_before|balance_after/
    );
  }
);

test(
  "service invokes only bounded adjustment RPC",
  () => {
    assert.match(
      service,
      /cing_wallet_admin_adjust_balance_atomic_v1/
    );

    assert.doesNotMatch(
      service,
      /cing_wallet_apply_mutation_private/
    );

    assert.doesNotMatch(
      service,
      /\.from\s*\(\s*["']cing_wallet_accounts/
    );

    assert.doesNotMatch(
      service,
      /\.from\s*\(\s*["']cing_wallet_transactions/
    );
  }
);

test(
  "reference must be complete pair and reason code is bounded",
  () => {
    assert.match(
      migration,
      /v_reference_type is null[\s\S]*<>[\s\S]*v_reference_id is null/
    );

    assert.match(
      migration,
      /\^\[a-z0-9\]\[a-z0-9_\]\{1,63\}\$/
    );
  }
);
