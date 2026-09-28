"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

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
  "db/migrations/20260926_cing_revive_credit_admin_price_authority_v1.sql"
);

const mirror = read(
  "supabase/migrations/20260926015100_cing_revive_credit_admin_price_authority_v1.sql"
);

const wallet = read(
  "db/migrations/20260925_cing_wallet_revive_credit_purchase_authority_v1.sql"
);

const points = read(
  "db/migrations/20260926_cing_points_revive_credit_purchase_authority_v1.sql"
);

const policy = read(
  "db/migrations/20260924_cing_revive_credit_wallet_price_policy_v1.sql"
);

const executable =
  sql.replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  );

test(
  "Admin price migration mirror exact",
  () => {
    assert.equal(
      sql,
      mirror
    );
  }
);

test(
  "uses existing app_configs price",
  () => {
    assert.match(
      executable,
      /update public\.app_configs/i
    );

    assert.match(
      executable,
      /set wallet_revive_credit_price\s*=\s*p_price_vnd/i
    );
  }
);

test(
  "Wallet and Points read one price",
  () => {
    assert.match(
      wallet,
      /ac\.wallet_revive_credit_price/
    );

    assert.match(
      points,
      /ac\.wallet_revive_credit_price/
    );
  }
);

test(
  "NULL remains unconfigured policy",
  () => {
    assert.match(
      policy,
      /wallet_revive_credit_price is null/i
    );

    assert.match(
      executable,
      /when p_price_vnd is null/i
    );
  }
);

test(
  "price must be divisible by 1000",
  () => {
    assert.match(
      executable,
      /mod\(\s*p_price_vnd,\s*1000\s*\)\s*<>\s*0/
    );

    assert.match(
      executable,
      /p_price_vnd\s*\/\s*1000/
    );
  }
);

test(
  "historical Admin replay before current config read",
  () => {
    const replay =
      executable.indexOf(
        "from\n    public.cing_revive_credit_admin_price_audit"
      );

    const config =
      executable.indexOf(
        "from public.app_configs"
      );

    assert.ok(
      replay >= 0
    );

    assert.ok(
      config > replay
    );
  }
);

test(
  "idempotency conflict is explicit",
  () => {
    assert.match(
      executable,
      /request_id uuid primary key/i
    );

    assert.match(
      executable,
      /pg_advisory_xact_lock/
    );

    assert.match(
      executable,
      /REVIVE_ADMIN_REQUEST_CONFLICT/
    );
  }
);

test(
  "config update and audit insertion share transaction",
  () => {
    assert.match(
      executable,
      /^begin\s*;/i
    );

    assert.match(
      executable,
      /insert into\s+public\.cing_revive_credit_admin_price_audit/i
    );

    assert.match(
      executable,
      /commit\s*;\s*$/i
    );
  }
);

test(
  "legacy Wallet play price is not modified",
  () => {
    assert.doesNotMatch(
      executable,
      /\bwallet_play_price\b/
    );
  }
);

test(
  "Admin price RPC remains dormant",
  () => {
    assert.doesNotMatch(
      executable,
      /\bgrant\s+execute\b/i
    );

    assert.match(
      executable,
      /revoke all\s+on function\s+public\.cing_revive_credit_admin_set_price_v1/i
    );
  }
);

test(
  "does not mutate customer financial balances",
  () => {
    assert.doesNotMatch(
      executable,
      /\b(?:update|insert into|delete from)\s+public\.(?:players|cing_wallet_accounts|cing_wallet_transactions|cing_revive_credit_balances|cing_revive_credit_transactions|point_transactions)\b/i
    );
  }
);

test(
  "Admin audit is immutable to service_role",
  () => {
    assert.match(
      executable,
      /revoke all\s+on table\s+public\.cing_revive_credit_admin_price_audit/i
    );

    assert.match(
      executable,
      /grant select\s+on table\s+public\.cing_revive_credit_admin_price_audit/i
    );
  }
);
