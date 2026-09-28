"use strict";

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
    "../../../.."
  );

const SQL =
  fs.readFileSync(
    path.join(
      ROOT,
      "db/migrations/20260926_cing_game_gift_financial_foundation_v1.sql"
    ),
    "utf8"
  );

const MIRROR =
  fs.readFileSync(
    path.join(
      ROOT,
      "supabase/migrations/20260926012000_cing_game_gift_financial_foundation_v1.sql"
    ),
    "utf8"
  );

const executable =
  SQL.replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  ).replace(
    /--[^\n]*/g,
    ""
  );

test(
  "gift migration mirror is exact",
  () => {
    assert.equal(
      SQL,
      MIRROR
    );
  }
);

test(
  "one server-owned gift catalog",
  () => {
    assert.match(
      executable,
      /create table public\.cing_game_gift_catalog/i
    );

    assert.match(
      executable,
      /price_vnd bigint not null/i
    );

    assert.match(
      executable,
      /charm_award integer not null/i
    );

    assert.match(
      executable,
      /enabled boolean not null\s+default false/i
    );
  }
);

test(
  "exact point conversion without rounding",
  () => {
    assert.match(
      executable,
      /mod\(\s*price_vnd,\s*1000\s*\)\s*=\s*0/i
    );

    assert.match(
      executable,
      /points_cost\s*=\s*price_vnd\s*\/\s*1000/i
    );

    assert.doesNotMatch(
      executable,
      /\bround\s*\(|\bceil\s*\(|\bfloor\s*\(/i
    );
  }
);

test(
  "Wallet and Points share one durable receipt",
  () => {
    assert.match(
      executable,
      /create table public\.cing_game_gift_purchases/i
    );

    assert.match(
      executable,
      /funding_source in\s*\(\s*'wallet',\s*'points'/i
    );

    assert.match(
      executable,
      /id uuid primary key/i
    );
  }
);

test(
  "financial snapshot is internally consistent",
  () => {
    assert.match(
      executable,
      /charm_balance_after\s*=\s*charm_balance_before\s*\+\s*charm_awarded::bigint/i
    );

    assert.match(
      executable,
      /points_balance_after\s*=\s*points_balance_before\s*-\s*points_cost/i
    );
  }
);

test(
  "point-funded gifts require durable iPOS state",
  () => {
    assert.match(
      executable,
      /cing_game_gift_ipos_pending_idx/i
    );

    assert.match(
      executable,
      /cing_game_gift_ipos_protection_idx/i
    );

    assert.match(
      executable,
      /'pending',\s*'processing',\s*'synced',\s*'failed'/i
    );
  }
);

test(
  "gift point ledger has unique purchase reference",
  () => {
    assert.match(
      executable,
      /create unique index\s+cing_point_tx_game_gift_v1_uq/i
    );

    assert.match(
      executable,
      /'gift_purchase_id'/i
    );
  }
);

test(
  "no catalog seed or gift purchase activation",
  () => {
    assert.doesNotMatch(
      executable,
      /insert into\s+public\.cing_game_gift_catalog/i
    );

    assert.doesNotMatch(
      executable,
      /\bgrant execute\b/i
    );

    assert.doesNotMatch(
      executable,
      /create\s+(or replace\s+)?function/i
    );
  }
);

test(
  "existing Charm and Wallet are not mutated",
  () => {
    assert.doesNotMatch(
      executable,
      /update\s+public\.players/i
    );

    assert.doesNotMatch(
      executable,
      /update\s+public\.cing_wallet_accounts/i
    );

    assert.doesNotMatch(
      executable,
      /insert into\s+public\.notifications/i
    );
  }
);
