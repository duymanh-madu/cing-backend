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
  "20260927_cing_legacy_crm_snapshot_review_v1.sql"
);

const mirror = path.join(
  root,
  "supabase/migrations/",
  "20260927004000_cing_legacy_crm_snapshot_review_v1.sql"
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
  "AF.3 SQL mirrors are identical",
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
  "AF.3 is one transaction",
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
  "RPC accepts only canonical CRM order ID",
  () => {
    assert.match(
      executable,
      /create function\s+public\.cing_legacy_crm_order_snapshot_review_v1\s*\(\s*p_crm_order_id bigint\s*\)/i
    );

    assert.doesNotMatch(
      executable,
      /\bp_(?:user_id|order_code|amount|plays|price|verified|cutover_at)\b/i
    );
  }
);

test(
  "RPC uses bounded security-definer search path",
  () => {
    assert.match(
      executable,
      /security definer\s+set search_path = ''/i
    );
  }
);

test(
  "RPC locks and validates durable CRM row",
  () => {
    for (const marker of [
      "from public.crm_orders c",
      "where c.id = p_crm_order_id",
      "for update",
      "v_crm.processed is not true",
      "v_crm.order_amount <= 0",
      "CING_LEGACY_CRM_USER_MISSING",
      "CING_LEGACY_CRM_ORDER_CODE_MISSING",
    ]) {
      assert.ok(
        executable.includes(marker),
        marker
      );
    }
  }
);

test(
  "Commerce order-code collision fails closed",
  () => {
    assert.match(
      executable,
      /from public\.orders o\s+where o\.order_code = v_order_code/i
    );

    assert.match(
      executable,
      /CING_LEGACY_CRM_COMMERCE_IDENTITY_REVIEW_REQUIRED/i
    );
  }
);

test(
  "CRM snapshot uses database row identity",
  () => {
    assert.match(
      executable,
      /v_crm_ref := v_crm\.id::text;/i
    );

    assert.match(
      executable,
      /v_canonical_key :=\s*'crm_order:' \|\| v_crm_ref;/i
    );

    assert.match(
      executable,
      /si\.source_system = 'crm_order'\s+and si\.source_reference = v_crm_ref/i
    );
  }
);

test(
  "historical entitlement remains unverified",
  () => {
    assert.match(
      executable,
      /insert into\s+public\.cing_legacy_order_entitlement_snapshots/i
    );

    assert.match(
      executable,
      /'review_required',\s+v_review_reason,\s+v_evidence/i
    );

    assert.doesNotMatch(
      executable,
      /from public\.app_configs/i
    );

    assert.doesNotMatch(
      executable,
      /v_crm\.created_at/i
    );

    assert.doesNotMatch(
      executable,
      /from public\.analytics_events/i
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
      /CING_LEGACY_CRM_SOURCE_IDENTITY_CONFLICT/i
    );

    assert.match(
      executable,
      /CING_LEGACY_CRM_SNAPSHOT_REPLAY_CONFLICT/i
    );
  }
);

test(
  "identity verification is review-only",
  () => {
    assert.match(
      executable,
      /'crm_processed_row_review_only'/i
    );

    assert.match(
      executable,
      /v_identity\.evidence_summary <>\s*v_identity_evidence/i
    );
  }
);

test(
  "RPC does not mutate financial or game balances",
  () => {
    for (const forbidden of [
      /update\s+public\.players\b/i,
      /insert\s+into\s+public\.game_play_transactions\b/i,
      /insert\s+into\s+public\.cing_revive_credit_transactions\b/i,
      /update\s+public\.cing_wallet_accounts\b/i,
      /update\s+public\.crm_orders\b/i,
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
      /revoke all\s+on function\s+public\.cing_legacy_crm_order_snapshot_review_v1\s*\(\s*bigint\s*\)\s+from public, anon, authenticated, service_role;/i
    );

    assert.doesNotMatch(
      executable,
      /grant execute\b/i
    );
  }
);
