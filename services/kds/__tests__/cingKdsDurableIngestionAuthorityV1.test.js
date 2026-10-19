"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const name =
  "20261002_cing_kds_durable_ingestion_authority_v1.sql";

const sqlA = fs.readFileSync(
  path.join(root, "db/migrations", name),
  "utf8"
);

const sqlB = fs.readFileSync(
  path.join(root, "docs/kds/draft-migrations/r1-original", name),
  "utf8"
);

test("SQL mirrors match", () => {
  assert.equal(sqlA, sqlB);
});

test("SECURITY DEFINER uses restricted search path", () => {
  assert.match(sqlA, /SECURITY DEFINER/i);
  assert.match(sqlA, /SET search_path = pg_catalog/i);
});

test("No client or backend execution grant", () => {
  assert.match(
    sqlA,
    /FROM PUBLIC, anon, authenticated, service_role/i
  );
  assert.doesNotMatch(
    sqlA,
    /^\s*GRANT\s+EXECUTE\b/im
  );
});

test("Durable transaction uniqueness", () => {
  assert.match(
    sqlA,
    /ON CONFLICT \(pos_parent, tran_id\)/i
  );
});

test("Inbox insert is pending payment verification", () => {
  assert.match(
    sqlA,
    /'pending_verification',\s*'pending'/i
  );
});

test("Duplicate and conflict require locked row", () => {
  assert.match(sqlA, /FOR UPDATE;/i);

  const lock = sqlA.indexOf("FOR UPDATE;");
  const conflict = sqlA.indexOf(
    "INSERT INTO public.cing_kds_inbox_conflicts"
  );

  assert.ok(lock >= 0);
  assert.ok(conflict > lock);
});

test("Incoming conflict cannot overwrite original", () => {
  assert.match(
    sqlA,
    /incoming_snapshot jsonb NOT NULL/i
  );

  assert.doesNotMatch(
    sqlA,
    /SET event_snapshot\s*=/i
  );
});

test("Conflict evidence is idempotent", () => {
  assert.match(
    sqlA,
    /UNIQUE \(inbox_id, incoming_fingerprint\)/i
  );
  assert.match(
    sqlA,
    /ON CONFLICT \(inbox_id, incoming_fingerprint\)/i
  );
});

test("Mismatch marks review required", () => {
  assert.match(
    sqlA,
    /SET ingestion_status = 'review_required'/i
  );
});

test("Identity and cup validation exist", () => {
  assert.match(sqlA, /KDS_SNAPSHOT_POS_ID_MISMATCH/);
  assert.match(sqlA, /KDS_INVALID_CUP_SNAPSHOT/);
});

test("No runtime activation in migration", () => {
  assert.doesNotMatch(
    sqlA,
    /^\s*CREATE\s+TRIGGER\b/im
  );

  assert.doesNotMatch(
    sqlA,
    /^\s*CREATE\s+POLICY\b/im
  );
});
