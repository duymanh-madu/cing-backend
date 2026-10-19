"use strict";

const {
  normalizeEvent11
} = require("./cingKdsEvent11NormalizerV1");

const {
  compareKdsItemParity
} = require("./cingKdsItemParityV1");

/*
 * Pure bidirectional audit.
 *
 * Source invoices MUST come from an independently
 * verified, complete invoice source.
 *
 * A webhook-derived list alone cannot prove completeness.
 * No financial or payment authority is granted here.
 */

function reconcileKdsBatch({
  sourceInvoices,
  kdsOrders,
} = {}) {
  if (
    !Array.isArray(sourceInvoices) ||
    !Array.isArray(kdsOrders)
  ) {
    throw new Error("KDS_RECONCILIATION_INPUT_REQUIRED");
  }

  const keyOf = x =>
    JSON.stringify([x.pos_parent, String(x.tran_id)]);

  const source = new Map();
  const actual = new Map();

  const duplicateSources = [];
  const duplicateOrders = [];
  const invalidSources = [];
  const invalidOrders = [];
  const missingOrders = [];
  const extraOrders = [];
  const mismatchedOrders = [];

  for (let i = 0; i < sourceInvoices.length; i++) {
    try {
      const normalized = normalizeEvent11(sourceInvoices[i]);
      const key = keyOf(normalized);

      if (source.has(key)) {
        duplicateSources.push(key);
      } else {
        source.set(key, {
          normalized,
          event: sourceInvoices[i]
        });
      }
    } catch {
      invalidSources.push(i);
    }
  }

  for (let i = 0; i < kdsOrders.length; i++) {
    const row = kdsOrders[i];

    if (
      !row ||
      typeof row !== "object" ||
      typeof row.pos_parent !== "string" ||
      !row.pos_parent.trim() ||
      typeof row.tran_id !== "string" ||
      !row.tran_id.trim() ||
      !Number.isSafeInteger(Number(row.pos_id)) ||
      Number(row.pos_id) <= 0 ||
      !Array.isArray(row.cups)
    ) {
      invalidOrders.push(i);
      continue;
    }

    const key = keyOf(row);

    if (actual.has(key)) {
      duplicateOrders.push(key);
    } else {
      actual.set(key, row);
    }
  }

  let matchedOrders = 0;
  let expectedCups = 0;
  let actualCups = 0;

  for (const [key, entry] of source) {
    expectedCups += entry.normalized.total_cups;

    const row = actual.get(key);

    if (!row) {
      missingOrders.push(key);
      continue;
    }

    actualCups += row.cups.length;

    if (
      Number(row.pos_id) !== entry.normalized.pos_id
    ) {
      mismatchedOrders.push({
        key,
        reason: "KDS_BRANCH_MISMATCH"
      });
      continue;
    }

    let parity;

    try {
      parity = compareKdsItemParity(
        entry.event,
        row.cups
      );
    } catch {
      mismatchedOrders.push({
        key,
        reason: "KDS_ITEM_PARITY_EXCEPTION"
      });
      continue;
    }

    if (parity.verdict !== "pass") {
      mismatchedOrders.push({
        key,
        reason: "KDS_ITEM_PARITY_MISMATCH",
        missing_units: parity.missing_unit_keys.length,
        extra_units: parity.extra_unit_keys.length,
        mismatched_units: parity.mismatched_unit_keys.length
      });
    } else {
      matchedOrders++;
    }
  }

  for (const [key, row] of actual) {
    if (!source.has(key)) {
      extraOrders.push(key);
      actualCups += row.cups.length;
    }
  }

  const structuralPass =
    source.size > 0 &&
    invalidSources.length === 0 &&
    invalidOrders.length === 0 &&
    duplicateSources.length === 0 &&
    duplicateOrders.length === 0 &&
    missingOrders.length === 0 &&
    extraOrders.length === 0 &&
    mismatchedOrders.length === 0 &&
    matchedOrders === source.size &&
    expectedCups === actualCups;

  return {
    // No independent iPOS coverage authority exists yet.
    // Never trust a caller-supplied completeness claim.
    verdict: structuralPass ? "not_verified" : "fail",

    structural_verdict: structuralPass ? "pass" : "fail",
    source_completeness_verified: false,

    expected_orders: source.size,
    actual_orders: actual.size,
    matched_orders: matchedOrders,
    expected_cups: expectedCups,
    actual_cups: actualCups,

    missing_orders: missingOrders.sort(),
    extra_orders: extraOrders.sort(),
    mismatched_orders: mismatchedOrders,
    duplicate_source_keys: duplicateSources.sort(),
    duplicate_order_keys: duplicateOrders.sort(),
    invalid_source_indices: invalidSources,
    invalid_order_indices: invalidOrders,

    // This audit cannot establish these independently.
    payment_authority_verified: false,
    modifiers_verified: false
  };
}

module.exports = { reconcileKdsBatch };
