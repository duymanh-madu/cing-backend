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


function read(relativePath) {
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
    "db/migrations/20260910_cing_wallet_featured_topup_tier_v1.sql"
  );

const controller =
  read(
    "controllers/admin/adminWalletController.js"
  );


test(
  "featured tier is additive presentation metadata",
  () => {
    assert.match(
      migration,
      /is_featured boolean[\s\S]*default false/i
    );

    assert.match(
      migration,
      /one_featured[\s\S]*where[\s\S]*is_featured\s*=\s*true/i
    );
  }
);


test(
  "canonical promotion row lock remains intact",
  () => {
    assert.match(
      migration,
      /cing_wallet_topup_promotion_config[\s\S]*for update;/i
    );

    assert.doesNotMatch(
      migration,
      /pg_advisory_xact_lock/i
    );
  }
);


test(
  "financial tier fields remain mandatory bigint authority",
  () => {
    assert.match(
      controller,
      /min_topup_amount:[\s\S]*normalizePositiveBigint/
    );

    assert.match(
      controller,
      /bonus_amount:[\s\S]*normalizePositiveBigint/
    );

    assert.match(
      controller,
      /CING_WALLET_PROMOTION_TIER_MIN_TOPUP/
    );

    assert.match(
      controller,
      /CING_WALLET_PROMOTION_TIER_BONUS/
    );
  }
);


test(
  "admin tier input allows only the two financial keys plus is_featured",
  () => {
    assert.match(
      controller,
      /allowedTierKeys/
    );

    assert.match(
      controller,
      /"is_featured"/
    );

    assert.match(
      controller,
      /typeof tier\.is_featured[\s\S]*"boolean"/
    );

    assert.match(
      controller,
      /tierKeys\.some/
    );
  }
);


test(
  "featured tier uniqueness is guarded in HTTP and PostgreSQL",
  () => {
    assert.match(
      controller,
      /featuredTierCount[\s\S]*>\s*1[\s\S]*CING_WALLET_PROMOTION_MULTIPLE_FEATURED_TIERS/
    );

    assert.match(
      migration,
      /v_featured_count[\s\S]*>\s*1[\s\S]*CING_WALLET_PROMOTION_MULTIPLE_FEATURED_TIERS/i
    );

    assert.match(
      migration,
      /create unique index[\s\S]*one_featured[\s\S]*where[\s\S]*is_featured\s*=\s*true/i
    );
  }
);


test(
  "canonical promotion read exposes featured metadata",
  () => {
    assert.match(
      migration,
      /cing_wallet_get_topup_promotion_v1\(\)[\s\S]*'is_featured'[\s\S]*t\.is_featured/i
    );
  }
);


test(
  "featured migration cannot mutate Wallet balances",
  () => {
    assert.doesNotMatch(
      migration,
      /cing_wallet_apply_mutation_private/i
    );

    assert.doesNotMatch(
      migration,
      /cing_wallet_accounts[\s\S]*(update|insert|delete)/i
    );

    assert.doesNotMatch(
      migration,
      /cing_wallet_transactions[\s\S]*(update|insert|delete)/i
    );
  }
);


test(
  "featured migration preserves service-role-only RPC ACL",
  () => {
    for (
      const fn of [
        "cing_wallet_admin_configure_topup_promotion_v1",
        "cing_wallet_get_topup_promotion_v1",
      ]
    ) {
      assert.match(
        migration,
        new RegExp(
          `revoke all[\\s\\S]*${fn}[\\s\\S]*from public, anon, authenticated`,
          "i"
        )
      );

      assert.match(
        migration,
        new RegExp(
          `grant execute[\\s\\S]*${fn}[\\s\\S]*to service_role`,
          "i"
        )
      );
    }
  }
);


test(
  "migration is one PostgreSQL transaction",
  () => {
    assert.equal(
      (
        migration.match(
          /^\s*begin;\s*$/gmi
        ) || []
      ).length,
      1
    );

    assert.equal(
      (
        migration.match(
          /^\s*commit;\s*$/gmi
        ) || []
      ).length,
      1
    );
  }
);
