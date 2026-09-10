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

const read =
  relative =>
    fs.readFileSync(
      path.join(
        ROOT,
        relative
      ),
      "utf8"
    );

const migration =
  read(
    "db/migrations/20260910_cing_wallet_admin_ledger_v1.sql"
  );

const service =
  read(
    "services/wallet/walletAdminService.js"
  );

const controller =
  read(
    "controllers/admin/adminWalletController.js"
  );

const routes =
  read(
    "routes/adminWalletRoutes.js"
  );

test(
  "admin ledger is service-role RPC read authority",
  () => {
    assert.match(
      migration,
      /security definer/i
    );

    assert.match(
      migration,
      /grant execute[\s\S]*to service_role/i
    );

    assert.match(
      migration,
      /revoke all[\s\S]*from authenticated/i
    );

    assert.match(
      service,
      /supabase\.rpc\(\s*"cing_wallet_admin_transactions_v1"/
    );
  }
);

test(
  "admin ledger cannot mutate Wallet financial state",
  () => {
    assert.doesNotMatch(
      migration,
      /\b(insert\s+into|update|delete\s+from)\s+public\.cing_wallet_(accounts|transactions)\b/i
    );
  }
);

test(
  "admin ledger returns canonical financial transaction fields",
  () => {
    for (
      const field
      of [
        "user_id",
        "transaction_type",
        "amount",
        "balance_before",
        "balance_after",
        "reference_type",
        "reference_id",
        "reason",
        "note",
        "actor_type",
        "actor_id",
        "created_at",
      ]
    ) {
      assert.match(
        migration,
        new RegExp(
          `wt\\.${field}`
        )
      );
    }
  }
);

test(
  "admin ledger uses deterministic keyset pagination",
  () => {
    assert.match(
      migration,
      /wt\.created_at\s*<[\s\S]*p_before_created_at/i
    );

    assert.match(
      migration,
      /wt\.created_at\s*=[\s\S]*p_before_created_at[\s\S]*wt\.id\s*<[\s\S]*p_before_id/i
    );

    assert.match(
      migration,
      /order by[\s\S]*wt\.created_at desc[\s\S]*wt\.id desc/i
    );

    assert.match(
      controller,
      /base64url/
    );
  }
);

test(
  "admin ledger accepts only canonical Wallet transaction types",
  () => {
    for (
      const type
      of [
        "topup",
        "topup_promotion",
        "payment",
        "refund",
        "reversal",
        "admin_adjustment",
      ]
    ) {
      assert.match(
        migration,
        new RegExp(
          `'${type}'`
        )
      );

      assert.match(
        controller,
        new RegExp(
          `"${type}"`
        )
      );
    }
  }
);

test(
  "admin ledger is protected by reporting permission",
  () => {
    assert.match(
      routes,
      /"\/transactions"[\s\S]*"wallet\.reporting\.read"[\s\S]*getTransactions/
    );
  }
);

test(
  "admin HTTP response exposes items and opaque next cursor",
  () => {
    assert.match(
      controller,
      /items,[\s\S]*next_cursor:/
    );

    assert.match(
      controller,
      /rows\.length > limit/
    );
  }
);
