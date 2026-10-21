"use strict";

const {
  branchIdentity
} = require("./cingKdsBranchAccessPolicyV1");

function reconciliationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function count(value, code) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw reconciliationError(code);
  }
  return number;
}

function exactBoolean(value, code) {
  if (value !== true && value !== false) {
    throw reconciliationError(code);
  }
  return value;
}

function evaluateReleaseReconciliation({ branch, snapshot } = {}) {
  const normalizedBranch = branchIdentity(branch);
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw reconciliationError("KDS_RECONCILIATION_SNAPSHOT_REQUIRED");
  }
  const snapshotBranch = branchIdentity(snapshot);
  if (
    snapshotBranch.pos_parent !== normalizedBranch.pos_parent ||
    snapshotBranch.pos_id !== normalizedBranch.pos_id
  ) {
    throw reconciliationError("KDS_RECONCILIATION_BRANCH_MISMATCH");
  }

  const metrics = Object.freeze({
    source_invoice_count: count(snapshot.source_invoice_count, "KDS_RECONCILIATION_SOURCE_COUNT_INVALID"),
    projected_invoice_count: count(snapshot.projected_invoice_count, "KDS_RECONCILIATION_PROJECTED_COUNT_INVALID"),
    missing_invoice_count: count(snapshot.missing_invoice_count, "KDS_RECONCILIATION_MISSING_COUNT_INVALID"),
    extra_invoice_count: count(snapshot.extra_invoice_count, "KDS_RECONCILIATION_EXTRA_COUNT_INVALID"),
    item_pass_count: count(snapshot.item_pass_count, "KDS_RECONCILIATION_ITEM_PASS_COUNT_INVALID"),
    item_fail_count: count(snapshot.item_fail_count, "KDS_RECONCILIATION_ITEM_FAIL_COUNT_INVALID"),
    cup_expected_count: count(snapshot.cup_expected_count, "KDS_RECONCILIATION_CUP_EXPECTED_INVALID"),
    cup_projected_count: count(snapshot.cup_projected_count, "KDS_RECONCILIATION_CUP_PROJECTED_INVALID")
  });

  const sourceComplete = exactBoolean(snapshot.source_snapshot_complete, "KDS_RECONCILIATION_SOURCE_COMPLETENESS_REQUIRED");
  const recoveryComplete = exactBoolean(snapshot.recovery_complete, "KDS_RECONCILIATION_RECOVERY_REQUIRED");
  const modifiersVerified = exactBoolean(snapshot.modifiers_verified, "KDS_RECONCILIATION_MODIFIERS_REQUIRED");
  const invoiceExact = metrics.source_invoice_count === metrics.projected_invoice_count &&
    metrics.missing_invoice_count === 0 && metrics.extra_invoice_count === 0;
  const itemsExact = metrics.item_fail_count === 0 &&
    metrics.item_pass_count === metrics.source_invoice_count &&
    metrics.cup_expected_count === metrics.cup_projected_count;
  const pass = sourceComplete && recoveryComplete && modifiersVerified && invoiceExact && itemsExact;

  return Object.freeze({
    branch: normalizedBranch,
    status: pass ? "pass" : "hold",
    source_snapshot_complete: sourceComplete,
    recovery_complete: recoveryComplete,
    modifiers_verified: modifiersVerified,
    invoice_exact: invoiceExact,
    item_and_cup_exact: itemsExact,
    metrics
  });
}

module.exports = {
  evaluateReleaseReconciliation
};
