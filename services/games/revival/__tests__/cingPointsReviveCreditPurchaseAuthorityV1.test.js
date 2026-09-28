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

const PRIMARY =
  path.join(
    ROOT,
    "db/migrations/20260926_cing_points_revive_credit_purchase_authority_v1.sql"
  );

const MIRROR =
  path.join(
    ROOT,
    "supabase/migrations/20260926010000_cing_points_revive_credit_purchase_authority_v1.sql"
  );

const sql =
  fs.readFileSync(
    PRIMARY,
    "utf8"
  );

const mirror =
  fs.readFileSync(
    MIRROR,
    "utf8"
  );

const executable =
  sql.replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  ).replace(
    /--[^\n]*/g,
    ""
  );

test(
  "exact migration mirror",
  () => {
    assert.equal(
      sql,
      mirror
    );
  }
);

test(
  "one existing VND price is the sole pricing authority",
  () => {
    assert.match(
      executable,
      /select ac\.wallet_revive_credit_price[\s\S]*from public\.app_configs ac/i
    );

    assert.match(
      executable,
      /mod\(v_price,\s*1000\)\s*<>\s*0/i
    );

    assert.match(
      executable,
      /v_unit_points\s*:=\s*\(v_price\s*\/\s*1000\)::integer/i
    );

    assert.doesNotMatch(
      executable,
      /round\s*\(|ceil\s*\(|floor\s*\(/i
    );
  }
);

test(
  "quantity and total points cannot overflow",
  () => {
    assert.match(
      executable,
      /p_quantity\s*<=\s*0/i
    );

    assert.match(
      executable,
      /v_total_numeric\s*>\s*2147483647/i
    );

    assert.match(
      executable,
      /v_balance_before\s*<\s*v_total_points/i
    );
  }
);

test(
  "player balance is locked before historical replay and debit",
  () => {
    const lock =
      executable.indexOf(
        "from public.players p"
      );

    const replay =
      executable.indexOf(
        "from public.cing_points_revive_credit_purchases r"
      );

    const debit =
      executable.indexOf(
        "update public.players"
      );

    assert.ok(
      lock >= 0
    );

    assert.ok(
      replay > lock
    );

    assert.ok(
      debit > replay
    );

    assert.match(
      executable,
      /from public\.players p[\s\S]*for update/i
    );
  }
);

test(
  "historical request validates point and credit ledgers",
  () => {
    assert.match(
      executable,
      /POINTS_REVIVE_REQUEST_CONFLICT/
    );

    assert.match(
      executable,
      /POINTS_REVIVE_POINT_LEDGER_MISSING/
    );

    assert.match(
      executable,
      /POINTS_REVIVE_POINT_LEDGER_CONFLICT/
    );

    assert.match(
      executable,
      /POINTS_REVIVE_CREDIT_LEDGER_MISSING/
    );

    assert.match(
      executable,
      /POINTS_REVIVE_CREDIT_LEDGER_CONFLICT/
    );

    assert.match(
      executable,
      /v_existing\.unit_price_vnd/
    );

    assert.match(
      executable,
      /v_existing\.unit_price_points/
    );
  }
);

test(
  "point debit and Revive Credit grant share one RPC transaction",
  () => {
    const debit =
      executable.indexOf(
        "update public.players"
      );

    const ledger =
      executable.indexOf(
        "insert into public.point_transactions"
      );

    const credit =
      executable.indexOf(
        "from public.cing_revive_credit_apply_private_v1("
      );

    const receipt =
      executable.indexOf(
        "insert into public.cing_points_revive_credit_purchases"
      );

    assert.ok(
      debit >= 0
    );

    assert.ok(
      ledger > debit
    );

    assert.ok(
      credit > ledger
    );

    assert.ok(
      receipt > credit
    );

    assert.match(
      executable,
      /POINTS_REVIVE_CREDIT_GRANT_INVALID/
    );
  }
);

test(
  "permanent point ledger has a unique purchase reference",
  () => {
    assert.match(
      executable,
      /create unique index\s+cing_point_tx_revive_purchase_v1_uq/i
    );

    assert.match(
      executable,
      /'points_revive_credit_purchase_v1'/i
    );

    assert.match(
      executable,
      /'purchase_id',\s*p_request_id/i
    );
  }
);

test(
  "purchase receipt carries durable iPOS state",
  () => {
    for (
      const field of [
        "ipos_sync_status",
        "ipos_retry_count",
        "ipos_next_retry_at",
        "ipos_locked_until",
        "ipos_first_attempt_at",
        "ipos_synced_at",
        "ipos_last_error",
      ]
    ) {
      assert.match(
        executable,
        new RegExp(
          "\\b" + field + "\\b",
          "i"
        )
      );
    }

    assert.match(
      executable,
      /'pending'::text/i
    );
  }
);

test(
  "new financial RPC is dormant and client inaccessible",
  () => {
    assert.match(
      executable,
      /revoke all\s+on function\s+public\.cing_points_purchase_revive_credits_v1\s*\(\s*text,\s*integer,\s*uuid\s*\)\s*from public,\s*anon,\s*authenticated,\s*service_role/i
    );

    assert.doesNotMatch(
      executable,
      /\bgrant execute\b/i
    );
  }
);

test(
  "migration does not modify existing Wallet authority",
  () => {
    assert.doesNotMatch(
      executable,
      /create or replace function\s+public\.cing_wallet_purchase_revive_credits_v1/i
    );

    assert.doesNotMatch(
      executable,
      /update\s+public\.cing_wallet_accounts/i
    );

    assert.doesNotMatch(
      executable,
      /insert into\s+public\.cing_wallet_transactions/i
    );
  }
);

test(
  "migration installs authority without executing purchases",
  () => {
    assert.match(
      executable,
      /^\s*begin\s*;/i
    );

    assert.match(
      executable,
      /commit\s*;\s*$/i
    );

    assert.doesNotMatch(
      executable,
      /\bselect\s+\*\s+from\s+public\.cing_points_purchase_revive_credits_v1\s*\(/i
    );
  }
);
