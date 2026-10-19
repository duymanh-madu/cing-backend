"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const documentedEvent = require(
  "./fixtures/iposEvent11DocumentedV1.json"
);

const {
  normalizeEvent11
} = require("../cingKdsEvent11NormalizerV1");

const {
  buildIngestionCandidate
} = require("../cingKdsEvent11IngestionV1");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("Official Event 11 identity is recognized", () => {
  const result = normalizeEvent11(clone(documentedEvent));

  assert.equal(result.pos_parent, "KDS_DOC_TEST");
  assert.equal(Number(result.pos_id), 296);
  assert.equal(String(result.tran_id), "33902");
});

test("Official duplicate item lines remain two cups", () => {
  const result = normalizeEvent11(clone(documentedEvent));

  assert.equal(result.total_cups, 2);
  assert.equal(result.cups.length, 2);

  assert.deepEqual(
    result.cups.map(c => c.unit_key),
    ["0:0", "1:0"]
  );

  assert.deepEqual(
    result.cups.map(c => c.item_id),
    ["SU04", "SU04"]
  );
});

test("Documented candidate preserves exact item units", () => {
  const candidate = buildIngestionCandidate(
    clone(documentedEvent)
  );

  assert.equal(candidate.total_cups, 2);
  assert.equal(candidate.snapshot.cups.length, 2);

  assert.deepEqual(
    candidate.snapshot.cups.map(c => c.unit_key),
    ["0:0", "1:0"]
  );
});

test("Candidate identity uses transaction, not event type", () => {
  const first = buildIngestionCandidate(
    clone(documentedEvent)
  );

  const secondEvent = clone(documentedEvent);
  secondEvent.sale_manager.tran_id = "33903";

  const second = buildIngestionCandidate(secondEvent);

  assert.notEqual(first.tran_id, second.tran_id);
  assert.notEqual(first.fingerprint, second.fingerprint);
});

test("Changing a documented item quantity changes fingerprint", () => {
  const first = buildIngestionCandidate(
    clone(documentedEvent)
  );

  const modified = clone(documentedEvent);
  modified.sale_manager.items[0].quantity = 2;

  const second = buildIngestionCandidate(modified);

  assert.equal(first.total_cups, 2);
  assert.equal(second.total_cups, 3);
  assert.notEqual(first.fingerprint, second.fingerprint);
});

test("Event 11 guest invoice does not require membership", () => {
  const guest = clone(documentedEvent);

  delete guest.sale_manager.membership_id;
  delete guest.sale_manager.membership_name;

  const candidate = buildIngestionCandidate(guest);

  assert.equal(candidate.total_cups, 2);
});

test("Payment data does not become verified authority", () => {
  const candidate = buildIngestionCandidate(
    clone(documentedEvent)
  );

  assert.notEqual(
    candidate.payment_verification,
    "verified"
  );

  assert.equal(
    candidate.snapshot.payment_verification,
    undefined
  );
});

test("Undocumented item modifiers are not invented", () => {
  const candidate = buildIngestionCandidate(
    clone(documentedEvent)
  );

  for (const cup of candidate.snapshot.cups) {
    assert.equal(cup.modifiers_verified, undefined);
    assert.equal(cup.size, undefined);
    assert.equal(cup.toppings, undefined);
    assert.equal(cup.sugar, undefined);
    assert.equal(cup.ice, undefined);
    assert.equal(cup.note, undefined);
  }
});

test("Identical documentation event is deterministic", () => {
  const first = buildIngestionCandidate(
    clone(documentedEvent)
  );

  const second = buildIngestionCandidate(
    clone(documentedEvent)
  );

  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.snapshot, second.snapshot);
});

test("Incorrect Event 11 identifier is rejected", () => {
  const event = clone(documentedEvent);
  event.event_id = 10;

  assert.throws(
    () => buildIngestionCandidate(event)
  );
});
