"use strict";

const {
  branchIdentity
} = require("./cingKdsBranchAccessPolicyV1");

function gateError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function authorizeKdsReadRelease({ branch, mapping, reconciliation } = {}) {
  const requested = branchIdentity(branch);
  if (!mapping || typeof mapping !== "object" || !reconciliation || typeof reconciliation !== "object") {
    throw gateError("KDS_RELEASE_EVIDENCE_REQUIRED");
  }
  const mapped = branchIdentity(mapping.branch);
  const reconciled = branchIdentity(reconciliation.branch);
  if (
    mapped.pos_parent !== requested.pos_parent || mapped.pos_id !== requested.pos_id ||
    reconciled.pos_parent !== requested.pos_parent || reconciled.pos_id !== requested.pos_id
  ) {
    throw gateError("KDS_RELEASE_BRANCH_MISMATCH");
  }
  const approved = mapping.mapping_status === "source_verified" &&
    reconciliation.status === "pass" &&
    reconciliation.source_snapshot_complete === true &&
    reconciliation.recovery_complete === true &&
    reconciliation.modifiers_verified === true &&
    reconciliation.invoice_exact === true &&
    reconciliation.item_and_cup_exact === true;

  return Object.freeze({
    branch: requested,
    read_enabled: approved,
    reason: approved ? null : "KDS_RELEASE_EVIDENCE_INCOMPLETE"
  });
}

module.exports = {
  authorizeKdsReadRelease
};
