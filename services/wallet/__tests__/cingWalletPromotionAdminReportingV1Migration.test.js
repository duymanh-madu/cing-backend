"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const migration =
  fs.readFileSync(
    "db/migrations/20260828_cing_wallet_promotion_admin_reporting_v1.sql",
    "utf8"
  );


test(
  "promotion foundation is disabled by default with no default tiers",
  () => {
    assert.match(
      migration,
      /insert into[\s\S]*cing_wallet_topup_promotion_config[\s\S]*false/i
    );

    assert.match(
      migration,
      /CING_WALLET_PROMOTION_UNEXPECTED_INITIAL_TIERS/
    );

    /*
     * Comments may document example campaign semantics.
     *
     * What matters is executable migration behavior:
     * before the admin configuration function begins, the
     * migration must never insert any row into the tier table.
     */
    const adminFunctionStart =
      migration.indexOf(
        "public.cing_wallet_admin_configure_topup_promotion_v1("
      );

    assert.ok(
      adminFunctionStart > 0
    );

    const bootstrapRegion =
      migration.slice(
        0,
        adminFunctionStart
      );

    assert.doesNotMatch(
      bootstrapRegion,
      /insert\s+into\s+(?:\n|\s)*public\.cing_wallet_topup_promotion_tiers/i
    );
  }
);


test(
  "promotion uses threshold and bonus semantics without hardcoded campaign values",
  () => {
    assert.match(
      migration,
      /min_topup_amount bigint/
    );

    assert.match(
      migration,
      /bonus_amount bigint/
    );

    assert.match(
      migration,
      /min_topup_amount desc/
    );
  }
);


test(
  "promotion config is singleton and time-bounded",
  () => {
    assert.match(
      migration,
      /check \(id = 1\)/
    );

    assert.match(
      migration,
      /ends_at > starts_at/
    );
  }
);


test(
  "promotion tiers require positive whole-VND bigint values",
  () => {
    assert.match(
      migration,
      /min_topup_amount > 0/
    );

    assert.match(
      migration,
      /bonus_amount > 0/
    );

    assert.match(
      migration,
      /9223372036854775807/
    );
  }
);


test(
  "enabled promotion cannot have zero tiers",
  () => {
    assert.match(
      migration,
      /v_enabled[\s\S]*v_tier_count = 0[\s\S]*CING_WALLET_PROMOTION_ENABLED_WITHOUT_TIERS/
    );
  }
);


test(
  "admin configuration is serialized and replaces tiers atomically",
  () => {
    const lock =
      migration.indexOf(
        "for update;"
      );

    const deletion =
      migration.indexOf(
        "delete from\n    public.cing_wallet_topup_promotion_tiers"
      );

    const insertion =
      migration.indexOf(
        "insert into\n  public.cing_wallet_topup_promotion_tiers"
      );

    assert.ok(lock >= 0);
    assert.ok(deletion > lock);
    assert.ok(insertion > deletion);
  }
);


test(
  "every promotion mutation writes immutable full snapshot history",
  () => {
    assert.match(
      migration,
      /cing_wallet_topup_promotion_history/
    );

    assert.match(
      migration,
      /snapshot jsonb[\s\S]*not null/
    );

    assert.match(
      migration,
      /insert into[\s\S]*cing_wallet_topup_promotion_history[\s\S]*v_snapshot/
    );

    assert.doesNotMatch(
      migration,
      /update\s+public\.cing_wallet_topup_promotion_history/i
    );

    assert.doesNotMatch(
      migration,
      /delete\s+from\s+public\.cing_wallet_topup_promotion_history/i
    );
  }
);


test(
  "promotion configuration cannot directly mutate Wallet financial state",
  () => {
    const configureStart =
      migration.indexOf(
        "public.cing_wallet_admin_configure_topup_promotion_v1("
      );

    const readStart =
      migration.indexOf(
        "public.cing_wallet_get_topup_promotion_v1()",
        configureStart
      );

    const configure =
      migration.slice(
        configureStart,
        readStart
      );

    assert.doesNotMatch(
      configure,
      /cing_wallet_apply_mutation_private/
    );

    assert.doesNotMatch(
      configure,
      /cing_wallet_accounts/
    );

    assert.doesNotMatch(
      configure,
      /insert into[\s\S]*cing_wallet_transactions/
    );
  }
);


test(
  "existing verified top-up settlement is not replaced by this migration",
  () => {
    assert.doesNotMatch(
      migration,
      /create or replace function\s+public\.cing_wallet_settle_verified_topup_atomic/i
    );

    assert.match(
      migration,
      /to_regprocedure\([\s\S]*cing_wallet_settle_verified_topup_atomic\(bigint\)/
    );
  }
);


test(
  "report separates real-money topup from promotion bonus",
  () => {
    assert.match(
      migration,
      /'real_money_topup'[\s\S]*transaction_type =[\s\S]*'topup'/
    );

    assert.match(
      migration,
      /'promotion_bonus'[\s\S]*transaction_type =[\s\S]*'topup_promotion'/
    );
  }
);


test(
  "report exposes current Wallet liability and period spending",
  () => {
    assert.match(
      migration,
      /'total_wallet_balance'[\s\S]*sum\(balance\)/
    );

    assert.match(
      migration,
      /'wallet_spending'[\s\S]*sum\(-amount\)[\s\S]*'payment'/
    );
  }
);


test(
  "report is read-only",
  () => {
    const start =
      migration.indexOf(
        "public.cing_wallet_admin_summary_v1("
      );

    const acl =
      migration.indexOf(
        "FUNCTION ACL",
        start
      );

    const report =
      migration.slice(
        start,
        acl
      );

    assert.doesNotMatch(
      report,
      /\bupdate\b|\binsert\b|\bdelete\b/i
    );
  }
);


test(
  "promotion tables are not directly mutable by service role",
  () => {
    for (const table of [
      "cing_wallet_topup_promotion_config",
      "cing_wallet_topup_promotion_tiers",
      "cing_wallet_topup_promotion_history",
    ]) {
      assert.match(
        migration,
        new RegExp(
          `revoke all[\\s\\S]*${table}[\\s\\S]*from public, anon, authenticated, service_role`,
          "i"
        )
      );
    }
  }
);


test(
  "bounded promotion and reporting RPCs are backend-only",
  () => {
    for (const fn of [
      "cing_wallet_admin_configure_topup_promotion_v1",
      "cing_wallet_get_topup_promotion_v1",
      "cing_wallet_admin_summary_v1",
    ]) {
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
  "migration is exactly one PostgreSQL transaction",
  () => {
    const begins =
      migration.match(
        /^\s*begin;\s*$/gmi
      ) || [];

    const commits =
      migration.match(
        /^\s*commit;\s*$/gmi
      ) || [];

    assert.equal(
      begins.length,
      1
    );

    assert.equal(
      commits.length,
      1
    );

    assert.ok(
      migration
        .trim()
        .toLowerCase()
        .startsWith("begin;")
    );

    assert.ok(
      migration
        .trim()
        .toLowerCase()
        .endsWith("commit;")
    );
  }
);
