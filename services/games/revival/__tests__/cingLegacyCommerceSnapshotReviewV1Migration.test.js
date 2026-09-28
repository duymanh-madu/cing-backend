"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(
  __dirname,
  "../../../.."
);

const canonical = path.join(
  root,
  "db/migrations/",
  "20260927_cing_legacy_commerce_snapshot_review_v1.sql"
);

const mirror = path.join(
  root,
  "supabase/migrations/",
  "20260927003000_cing_legacy_commerce_snapshot_review_v1.sql"
);

const sql = fs.readFileSync(
  canonical,
  "utf8"
);

const mirrorSql = fs.readFileSync(
  mirror,
  "utf8"
);

const executable = sql.replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

test(
  "AE.1 SQL mirrors are identical",
  () => {
    assert.equal(
      crypto.createHash("sha256")
        .update(sql)
        .digest("hex"),
      crypto.createHash("sha256")
        .update(mirrorSql)
        .digest("hex")
    );
  }
);

test(
  "AE.1 is one transaction",
  () => {
    assert.match(
      executable,
      /^\s*begin;/i
    );

    assert.match(
      executable,
      /commit;\s*$/i
    );
  }
);

test(
  "RPC accepts only canonical order ID",
  () => {
    assert.match(
      executable,
      /create function\s+public\.cing_legacy_commerce_order_snapshot_review_v1\s*\(\s*p_order_id bigint\s*\)/i
    );

    assert.doesNotMatch(
      executable,
      /p_(?:user_id|amount|plays|price|verified|cutover_at)\b/i
    );
  }
);

test(
  "RPC is security definer with bounded search path",
  () => {
    assert.match(
      executable,
      /security definer\s+set search_path = ''/i
    );
  }
);

test(
  "RPC validates order and payment authority",
  () => {
    for (const marker of [
      "from public.orders",
      "for update",
      "payment_status <> 'paid'",
      "from public.payment_transactions",
      "p.order_created is true",
      "p.order_id = v_order.id",
      "p.payment_status = 'paid'",
      "p.payment_purpose = 'order'",
    ]) {
      assert.ok(
        executable.includes(marker),
        marker
      );
    }
  }
);

test(
  "RPC checks existing game-play ledger",
  () => {
    for (const marker of [
      "from public.game_play_transactions",
      "t.reference_type = 'order_spending'",
      "t.reference_id = v_order_ref",
      "v_ledger.transaction_type <> 'add'",
      "v_ledger.amount <= 0",
    ]) {
      assert.ok(
        executable.includes(marker),
        marker
      );
    }
  }
);

test(
  "missing ledger never manufactures entitlement",
  () => {
    assert.match(
      executable,
      /v_decision := 'review_required';[\s\S]*?v_expected := null;[\s\S]*?v_outstanding := null;/i
    );

    assert.match(
      executable,
      /ledger_absent_legacy_award_reconciliation_required/i
    );
  }
);

test(
  "durable award is not duplicated",
  () => {
    assert.match(
      executable,
      /v_decision := 'already_awarded';[\s\S]*?v_awarded := v_ledger.amount;[\s\S]*?v_expected := v_ledger.amount;[\s\S]*?v_outstanding := 0;/i
    );
  }
);

test(
  "snapshot and source identity are atomic",
  () => {
    assert.match(
      executable,
      /insert into\s+public\.cing_legacy_order_entitlement_snapshots/i
    );

    assert.match(
      executable,
      /insert into\s+public\.cing_legacy_order_entitlement_source_identities/i
    );

    assert.match(
      executable,
      /CING_LEGACY_COMMERCE_SNAPSHOT_REPLAY_CONFLICT/
    );

    assert.match(
      executable,
      /CING_LEGACY_COMMERCE_SOURCE_IDENTITY_CONFLICT/
    );
  }
);

test(
  "review does not infer cutover or historical price",
  () => {
    assert.doesNotMatch(
      executable,
      /from public\.app_configs/i
    );

    assert.doesNotMatch(
      executable,
      /v_payment\.paid_at/i
    );

    assert.match(
      executable,
      /v_key :=\s*'commerce_order:' \|\| v_order_ref/i
    );
  }
);

test(
  "no financial or game balance mutation",
  () => {
    for (const forbidden of [
      /update\s+public\.players\b/i,
      /insert\s+into\s+public\.game_play_transactions\b/i,
      /insert\s+into\s+public\.cing_revive_credit_transactions\b/i,
      /update\s+public\.cing_wallet_accounts\b/i,
      /update\s+public\.payment_transactions\b/i,
      /perform\s+public\.cing_revive_credit_apply_private_v1\b/i,
    ]) {
      assert.doesNotMatch(
        executable,
        forbidden
      );
    }
  }
);

test(
  "no API role receives EXECUTE",
  () => {
    assert.match(
      executable,
      /revoke all\s+on function\s+public\.cing_legacy_commerce_order_snapshot_review_v1\s*\(\s*bigint\s*\)\s+from public, anon, authenticated, service_role;/i
    );

    assert.doesNotMatch(
      executable,
      /grant execute\b/i
    );
  }
);
