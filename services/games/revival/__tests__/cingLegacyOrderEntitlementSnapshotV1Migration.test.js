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
  "20260927_cing_legacy_order_entitlement_snapshot_v1.sql"
);

const mirror = path.join(
  root,
  "supabase/migrations/",
  "20260927001000_cing_legacy_order_entitlement_snapshot_v1.sql"
);

const sql = fs.readFileSync(
  canonical,
  "utf8"
);

const mirrorSql = fs.readFileSync(
  mirror,
  "utf8"
);

test(
  "migration pair is byte-identical",
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
  "migration is one transaction",
  () => {
    assert.match(
      sql,
      /^\s*begin;/i
    );

    assert.match(
      sql,
      /commit;\s*$/i
    );
  }
);

test(
  "canonical order identity is unique",
  () => {
    assert.match(
      sql,
      /create unique index\s+cing_legacy_entitlement_canonical_order_uq[\s\S]*?canonical_order_key\s*\)/i
    );
  }
);

test(
  "source identity is unique",
  () => {
    assert.match(
      sql,
      /create unique index\s+cing_legacy_entitlement_source_identity_uq[\s\S]*?source_system,\s*source_reference\s*\)/i
    );
  }
);

test(
  "historical entitlement evidence is retained",
  () => {
    for (const field of [
      "cutover_at timestamptz",
      "entitlement_at timestamptz",
      "entitlement_time_source text",
      "evidence_verified boolean",
      "historical_spend_per_play bigint",
      "eligible_order_amount bigint",
      "source_evidence jsonb",
    ]) {
      assert.ok(
        sql.includes(field),
        field
      );
    }
  }
);

test(
  "expected, awarded and outstanding are separate",
  () => {
    for (const field of [
      "expected_plays integer",
      "already_awarded_plays integer",
      "outstanding_plays integer",
    ]) {
      assert.ok(
        sql.includes(field),
        field
      );
    }

    assert.match(
      sql,
      /outstanding_plays\s*=\s*expected_plays\s*-\s*already_awarded_plays/i
    );
  }
);

test(
  "policy decisions are bounded",
  () => {
    for (const decision of [
      "'review_required'",
      "'already_awarded'",
      "'eligible_for_reconciliation'",
      "'below_threshold'",
      "'post_cutover'",
    ]) {
      assert.ok(
        sql.includes(decision),
        decision
      );
    }
  }
);

test(
  "eligible entitlement requires verified history",
  () => {
    assert.match(
      sql,
      /decision <> 'eligible_for_reconciliation'[\s\S]*?evidence_verified is true[\s\S]*?entitlement_at < cutover_at/i
    );
  }
);

test(
  "service_role receives SELECT only",
  () => {
    assert.match(
      sql,
      /grant select\s+on table public\.cing_legacy_order_entitlement_snapshots\s+to service_role;/i
    );

    assert.doesNotMatch(
      sql,
      /grant\s+(?:insert|update|delete|all)\b/i
    );
  }
);

test(
  "snapshot SQL does not mutate financial domains",
  () => {
    const executable = sql.replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );

    for (const forbidden of [
      /update\s+public\.players\b/i,
      /insert\s+into\s+public\.game_play_transactions\b/i,
      /insert\s+into\s+public\.cing_revive_credit\b/i,
      /update\s+public\.cing_wallet_accounts\b/i,
      /create\s+or\s+replace\s+function\b/i,
      /create\s+trigger\b/i,
    ]) {
      assert.doesNotMatch(
        executable,
        forbidden
      );
    }
  }
);
