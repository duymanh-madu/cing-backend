"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildIngestionCandidate,
  classifyExisting
} = require("../cingKdsEvent11IngestionV1");

function sample() {
  return {
    event_id: 11,
    event: "sale_manager",
    timestamp: "1790955786871",
    sale_manager: {
      id: "event-A",
      pos_parent: "CING",
      pos_id: 101,
      tran_id: "10001",
      tran_no: "TA001",
      tran_date: "2026-10-02 20:00:00",
      created_at: "2026-10-02 20:01:00",
      items: [
        {
          item_id: "TC01",
          item_name: "Trân châu đường đen",
          quantity: 2
        }
      ]
    }
  };
}

test("Non-CRM order is accepted", () => {
  const candidate = buildIngestionCandidate(sample());

  assert.equal(candidate.total_cups, 2);
  assert.equal(
    candidate.payment_verification,
    "pending_verification"
  );
});

test("CRM is never required", () => {
  const a = sample();
  const b = sample();

  b.sale_manager.membership_id = "PRIVATE";
  b.sale_manager.membership_name = "CUSTOMER";

  assert.equal(
    buildIngestionCandidate(a).fingerprint,
    buildIngestionCandidate(b).fingerprint
  );
});

test("Sensitive payment and member data excluded", () => {
  const body = sample();

  body.sale_manager.membership_id = "PRIVATE_PHONE";
  body.sale_manager.payment_info = [{
    method_id: "CASH",
    trace_no: "PRIVATE_TRACE"
  }];

  const serialized = JSON.stringify(
    buildIngestionCandidate(body)
  );

  assert.ok(!serialized.includes("PRIVATE_PHONE"));
  assert.ok(!serialized.includes("PRIVATE_TRACE"));
  assert.ok(!serialized.includes("membership_id"));
});

test("Event retries are stable", () => {
  const a = sample();
  const b = sample();

  b.timestamp = "1790959999999";
  b.sale_manager.id = "event-B";

  const first = buildIngestionCandidate(a);
  const second = buildIngestionCandidate(b);

  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(
    classifyExisting(first, second).outcome,
    "duplicate"
  );
});

test("Altered quantities require review", () => {
  const a = buildIngestionCandidate(sample());

  const modified = sample();
  modified.sale_manager.items[0].quantity = 3;

  const b = buildIngestionCandidate(modified);

  assert.equal(
    classifyExisting(a, b).outcome,
    "conflict"
  );
});

test("New transaction is staged", () => {
  const candidate = buildIngestionCandidate(sample());

  assert.equal(
    classifyExisting(null, candidate).outcome,
    "new"
  );
});

test("Wrong event is rejected", () => {
  const body = sample();
  body.event_id = 10;
  body.event = "membership_log";

  assert.throws(
    () => buildIngestionCandidate(body),
    /KDS_NOT_EVENT_11/
  );
});

test("Different identity cannot be compared", () => {
  const first = buildIngestionCandidate(sample());

  const another = sample();
  another.sale_manager.tran_id = "10002";

  assert.throws(
    () => classifyExisting(
      first,
      buildIngestionCandidate(another)
    ),
    /KDS_IDENTITY_MISMATCH/
  );
});

test("SQL mirrors remain byte identical", () => {
  const root = path.resolve(__dirname, "../../..");

  const name =
    "20261002_cing_kds_event_inbox_v1.sql";

  const a = fs.readFileSync(
    path.join(root, "db/migrations", name),
    "utf8"
  );

  const b = fs.readFileSync(
    path.join(root, "docs/kds/draft-migrations/r1-original", name),
    "utf8"
  );

  assert.equal(a, b);
});

test("Inbox is dormant and client access closed", () => {
  const root = path.resolve(__dirname, "../../..");

  const sql = fs.readFileSync(
    path.join(
      root,
      "db/migrations",
      "20261002_cing_kds_event_inbox_v1.sql"
    ),
    "utf8"
  );

  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL/i);
  assert.doesNotMatch(sql, /\bGRANT\b/i);
  assert.doesNotMatch(sql, /\bCREATE TRIGGER\b/i);
});
