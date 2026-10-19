"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");

const sqlA = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20261002_cing_kds_atomic_cup_authority_v1.sql"
  ),
  "utf8"
);

const sqlB = fs.readFileSync(
  path.join(
    root,
    "docs/kds/draft-migrations/r1-original/20261002_cing_kds_atomic_cup_authority_v1.sql"
  ),
  "utf8"
);

test("SQL mirrors are identical", () => {
  assert.equal(sqlA, sqlB);
});

test("RPC is explicitly SECURITY DEFINER", () => {
  assert.match(sqlA, /SECURITY DEFINER/i);
  assert.match(
    sqlA,
    /SET search_path = pg_catalog/i
  );
});

test("RPC locks cup row before mutation", () => {
  assert.match(sqlA, /FOR UPDATE OF c/i);

  const lockPosition = sqlA.indexOf("FOR UPDATE OF c");
  const mutationPosition = sqlA.indexOf(
    "UPDATE public.cing_kds_cups"
  );

  assert.ok(lockPosition >= 0);
  assert.ok(mutationPosition > lockPosition);
});

test("Payment verification is mandatory", () => {
  assert.match(
    sqlA,
    /v_payment <> 'verified'/
  );
});

test("Persistent idempotency is checked", () => {
  assert.match(
    sqlA,
    /FROM public.cing_kds_cup_audit/
  );

  assert.match(
    sqlA,
    /KDS_IDEMPOTENCY_CONFLICT/
  );

  assert.match(sqlA, /'replayed'/);
});

test("Stale version is rejected", () => {
  assert.match(sqlA, /KDS_VERSION_CONFLICT/);
});

test("State transitions are restricted", () => {
  assert.match(sqlA, /KDS_INVALID_TRANSITION/);

  for (const state of [
    "pending",
    "preparing",
    "prepared",
    "served"
  ]) {
    assert.ok(sqlA.includes(state));
  }
});

test("Prepared and served timestamps are persisted", () => {
  assert.match(sqlA, /prepared_at = CASE/);
  assert.match(sqlA, /served_at = CASE/);
});

test("Cup update and audit share one SQL function", () => {
  const mutationPosition = sqlA.indexOf(
    "UPDATE public.cing_kds_cups"
  );

  const auditPosition = sqlA.indexOf(
    "INSERT INTO public.cing_kds_cup_audit"
  );

  assert.ok(mutationPosition >= 0);
  assert.ok(auditPosition > mutationPosition);
});

test("RPC execution remains closed", () => {
  assert.match(
    sqlA,
    /FROM PUBLIC, anon, authenticated, service_role/i
  );

  assert.doesNotMatch(
    sqlA,
    /\bGRANT\s+EXECUTE\b/i
  );
});

test("No production activation is included", () => {
  assert.doesNotMatch(
    sqlA,
    /\bCREATE\s+TRIGGER\b/i
  );

  assert.doesNotMatch(
    sqlA,
    /\bCREATE\s+POLICY\b/i
  );
});
