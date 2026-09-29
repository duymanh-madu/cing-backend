"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../..");

function read(relative) {
  return fs.readFileSync(
    path.join(ROOT, relative),
    "utf8"
  );
}

const dbPath =
  "db/migrations/20260930_cing_points_revive_purchase_activation_v1.sql";

const mirrorPath =
  "supabase/migrations/20260930030000_cing_points_revive_purchase_activation_v1.sql";

test(
  "points revive activation mirrors are byte-identical",
  () => {
    assert.equal(
      read(dbPath),
      read(mirrorPath)
    );
  }
);

test(
  "purchase RPC remains backend-only after activation",
  () => {
    const sql = read(dbPath);

    assert.match(
      sql,
      /revoke all[\s\S]*cing_points_purchase_revive_credits_v1[\s\S]*from public,\s*anon,\s*authenticated,\s*service_role/i
    );

    assert.match(
      sql,
      /grant execute[\s\S]*cing_points_purchase_revive_credits_v1[\s\S]*to service_role/i
    );

    assert.doesNotMatch(
      sql,
      /grant execute[\s\S]*cing_points_purchase_revive_credits_v1[\s\S]*to\s+(?:anon|authenticated|public)/i
    );
  }
);
