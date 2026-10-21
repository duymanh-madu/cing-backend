"use strict";

const {
  branchIdentity
} = require("./cingKdsBranchAccessPolicyV1");

const {
  compareExactInvoices
} = require("./cingKdsP7P8SourceCollectorContractV1");

function compositionError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredFunction(value, code) {
  if (typeof value !== "function") {
    throw compositionError(code);
  }
  return value;
}

function exactTarget(target) {
  const branch = branchIdentity(target);
  if (branch.pos_parent !== "BRAND-DQIR" || branch.pos_id !== "109664") {
    throw compositionError("KDS_P7P8_TARGET_NOT_APPROVED");
  }
  return branch;
}

function createKdsP7P8SourceCollectorV1({
  observeSourceMapping,
  loadSourceSnapshot,
  loadProjectedSnapshot,
  verifyRecoveryComplete,
  verifyModifiers
} = {}) {
  const observeMapping = requiredFunction(observeSourceMapping, "KDS_P7P8_MAPPING_OBSERVER_REQUIRED");
  const loadSource = requiredFunction(loadSourceSnapshot, "KDS_P7P8_SOURCE_SNAPSHOT_LOADER_REQUIRED");
  const loadProjected = requiredFunction(loadProjectedSnapshot, "KDS_P7P8_PROJECTED_SNAPSHOT_LOADER_REQUIRED");
  const verifyRecovery = requiredFunction(verifyRecoveryComplete, "KDS_P7P8_RECOVERY_VERIFIER_REQUIRED");
  const verifyAllModifiers = requiredFunction(verifyModifiers, "KDS_P7P8_MODIFIER_VERIFIER_REQUIRED");

  async function collect({ target } = {}) {
    const branch = exactTarget(target);
    const [source_observation, source_snapshot, projected_snapshot, recovery_complete, modifiers_verified] = await Promise.all([
      observeMapping({ target: branch }),
      loadSource({ target: branch }),
      loadProjected({ target: branch }),
      verifyRecovery({ target: branch }),
      verifyAllModifiers({ target: branch })
    ]);

    const reconciliation_snapshot = compareExactInvoices({
      source_snapshot,
      projected_snapshot,
      recovery_complete,
      modifiers_verified
    });

    if (
      reconciliation_snapshot.branch.pos_parent !== branch.pos_parent ||
      reconciliation_snapshot.branch.pos_id !== branch.pos_id
    ) {
      throw compositionError("KDS_P7P8_BRANCH_MISMATCH");
    }

    return Object.freeze({
      source_observation,
      reconciliation_snapshot
    });
  }

  return Object.freeze({ collect });
}

module.exports = {
  createKdsP7P8SourceCollectorV1
};
