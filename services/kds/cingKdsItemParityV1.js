"use strict";

const {
  normalizeEvent11
} = require("./cingKdsEvent11NormalizerV1");

/*
 * Read-only reconciliation.
 *
 * Compare every expected unit from the canonical Event 11
 * with the persisted KDS cup projection.
 *
 * This checks exact unit_key/item_id/item_name parity.
 * It does not prove completeness of the iPOS source feed,
 * nor does it validate undocumented modifiers/options.
 *
 * NEVER use this function to authorize payment.
 */

function compareKdsItemParity(event11, persistedCups) {
  const source = normalizeEvent11(event11);

  if (!Array.isArray(persistedCups)) {
    throw new Error("KDS_PARITY_CUPS_REQUIRED");
  }

  const expected = new Map();

  for (const cup of source.cups) {
    if (expected.has(cup.unit_key)) {
      throw new Error("KDS_PARITY_SOURCE_DUPLICATE");
    }

    expected.set(cup.unit_key, {
      item_id: cup.item_id,
      item_name: cup.item_name
    });
  }

  const actual = new Map();
  const duplicateKeys = [];

  for (const cup of persistedCups) {
    if (!cup || typeof cup !== "object") {
      throw new Error("KDS_PARITY_CUP_INVALID");
    }

    const key = cup.unit_key;

    if (typeof key !== "string" || !key) {
      throw new Error("KDS_PARITY_UNIT_KEY_INVALID");
    }

    if (actual.has(key)) {
      duplicateKeys.push(key);
      continue;
    }

    actual.set(key, {
      item_id: cup.item_id,
      item_name: cup.item_name,
      status: cup.status
    });
  }

  const missing = [];
  const extra = [];
  const mismatched = [];

  for (const [key, wanted] of expected) {
    const found = actual.get(key);

    if (!found) {
      missing.push(key);
      continue;
    }

    if (
      found.item_id !== wanted.item_id ||
      found.item_name !== wanted.item_name
    ) {
      mismatched.push(key);
    }
  }

  for (const key of actual.keys()) {
    if (!expected.has(key)) {
      extra.push(key);
    }
  }

  const validStatuses = new Set([
    "pending", "preparing", "prepared", "served"
  ]);

  const invalidStatus = [];

  for (const [key, cup] of actual) {
    if (!validStatuses.has(cup.status)) {
      invalidStatus.push(key);
    }
  }

  const sort = values => values.sort((a, b) =>
    a.localeCompare(b, "en")
  );

  const exact =
    missing.length === 0 &&
    extra.length === 0 &&
    mismatched.length === 0 &&
    duplicateKeys.length === 0 &&
    invalidStatus.length === 0 &&
    persistedCups.length === source.total_cups;

  return {
    verdict: exact ? "pass" : "fail",
    identity: {
      pos_parent: source.pos_parent,
      pos_id: source.pos_id,
      tran_id: source.tran_id
    },
    expected_cups: source.total_cups,
    persisted_cups: persistedCups.length,
    missing_unit_keys: sort(missing),
    extra_unit_keys: sort(extra),
    mismatched_unit_keys: sort(mismatched),
    duplicate_unit_keys: sort(duplicateKeys),
    invalid_status_unit_keys: sort(invalidStatus),
    // These are NOT implicitly verified by item parity.
    modifiers_verified: false,
    source_completeness_verified: false
  };
}

module.exports = { compareKdsItemParity };
