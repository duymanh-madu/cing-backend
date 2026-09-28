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
  "20260927_cing_legacy_order_entitlement_source_identity_v1.sql"
);

const mirror = path.join(
  root,
  "supabase/migrations/",
  "20260927002000_cing_legacy_order_entitlement_source_identity_v1.sql"
);

const ab = path.join(
  root,
  "db/migrations/",
  "20260927_cing_legacy_order_entitlement_snapshot_v1.sql"
);

const sql = fs.readFileSync(
  canonical,
  "utf8"
);

const mirrorSql = fs.readFileSync(
  mirror,
  "utf8"
);

const abSql = fs.readFileSync(
  ab,
  "utf8"
);

const executable = sql.replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

test(
  "AD migration mirrors are byte-identical",
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
  "AD is one PostgreSQL transaction",
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
  "AD references AB snapshot UUID",
  () => {
    assert.match(
      executable,
      /snapshot_id uuid\s+not null\s+references\s+public\.cing_legacy_order_entitlement_snapshots\(id\)/i
    );

    assert.match(
      abSql,
      /create table public\.cing_legacy_order_entitlement_snapshots/i
    );

    assert.match(
      abSql,
      /id uuid\s+primary key/i
    );
  }
);

test(
  "source identity is unique across all snapshots",
  () => {
    assert.match(
      executable,
      /create unique index\s+cing_legacy_source_identity_unique_source_uq\s+on public\.cing_legacy_order_entitlement_source_identities\s*\(\s*source_system,\s*source_reference\s*\)/i
    );
  }
);

test(
  "snapshot source identity is also unique",
  () => {
    assert.match(
      executable,
      /create unique index\s+cing_legacy_source_identity_snapshot_source_uq\s+on public\.cing_legacy_order_entitlement_source_identities\s*\(\s*snapshot_id,\s*source_system,\s*source_reference\s*\)/i
    );
  }
);

test(
  "source links require verification provenance",
  () => {
    for (const field of [
      "source_system text",
      "source_reference text",
      "verification_method text",
      "verification_reference text",
      "evidence_summary jsonb",
      "verified_at timestamptz",
    ]) {
      assert.ok(
        sql.includes(field),
        field
      );
    }

    for (const constraint of [
      "cing_legacy_source_identity_method_ck",
      "cing_legacy_source_identity_proof_ck",
      "cing_legacy_source_identity_evidence_ck",
    ]) {
      assert.ok(
        sql.includes(constraint),
        constraint
      );
    }
  }
);

test(
  "source links cannot cascade-delete snapshots",
  () => {
    assert.match(
      executable,
      /on update restrict\s+on delete restrict/i
    );
  }
);

test(
  "service_role has SELECT only",
  () => {
    assert.match(
      executable,
      /revoke all\s+on table\s+public\.cing_legacy_order_entitlement_source_identities\s+from service_role;/i
    );

    assert.match(
      executable,
      /grant select\s+on table\s+public\.cing_legacy_order_entitlement_source_identities\s+to service_role;/i
    );

    assert.doesNotMatch(
      executable,
      /grant\s+(?:insert|update|delete|all)\b/i
    );
  }
);

test(
  "AD creates no mutation RPC or trigger",
  () => {
    assert.doesNotMatch(
      executable,
      /create\s+(?:or replace\s+)?function\b/i
    );

    assert.doesNotMatch(
      executable,
      /create\s+trigger\b/i
    );
  }
);

test(
  "AD does not mutate financial domains",
  () => {
    for (const forbidden of [
      /update\s+public\.players\b/i,
      /insert\s+into\s+public\.players\b/i,
      /insert\s+into\s+public\.game_play_transactions\b/i,
      /insert\s+into\s+public\.cing_revive_credit_transactions\b/i,
      /update\s+public\.cing_wallet_accounts\b/i,
      /update\s+public\.app_configs\b/i,
    ]) {
      assert.doesNotMatch(
        executable,
        forbidden
      );
    }
  }
);

test(
  "AB canonical identity remains unchanged",
  () => {
    assert.match(
      abSql,
      /cing_legacy_entitlement_canonical_order_uq/i
    );

    assert.match(
      abSql,
      /cing_legacy_entitlement_source_identity_uq/i
    );
  }
);
