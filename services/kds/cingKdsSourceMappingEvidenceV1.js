"use strict";

const crypto = require("node:crypto");

const {
  branchIdentity
} = require("./cingKdsBranchAccessPolicyV1");

function mappingError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredString(value, code) {
  if (typeof value !== "string" || !value.trim()) {
    throw mappingError(code);
  }
  return value.trim();
}

function uuid(value, code) {
  const text = requiredString(value, code);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw mappingError(code);
  }
  return text;
}

function evidenceDigest(value) {
  const text = requiredString(value, "KDS_MAPPING_EVIDENCE_DIGEST_REQUIRED");
  if (!/^[a-f0-9]{64}$/i.test(text)) {
    throw mappingError("KDS_MAPPING_EVIDENCE_DIGEST_INVALID");
  }
  return text.toLowerCase();
}

function observedAt(value) {
  const text = requiredString(value, "KDS_MAPPING_OBSERVED_AT_REQUIRED");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(text)) {
    throw mappingError("KDS_MAPPING_OBSERVED_AT_INVALID");
  }
  return text;
}

function createSourceMappingEvidence({
  target,
  source_observation
} = {}) {
  const branch = branchIdentity(target);
  if (!source_observation || typeof source_observation !== "object" || Array.isArray(source_observation)) {
    throw mappingError("KDS_MAPPING_SOURCE_OBSERVATION_REQUIRED");
  }
  const observedBranch = branchIdentity(source_observation);
  if (
    observedBranch.pos_parent !== branch.pos_parent ||
    observedBranch.pos_id !== branch.pos_id
  ) {
    throw mappingError("KDS_MAPPING_BRANCH_MISMATCH");
  }

  const scope = Object.freeze({
    company_uid: uuid(source_observation.company_uid, "KDS_MAPPING_COMPANY_UUID_INVALID"),
    brand_uid: uuid(source_observation.brand_uid, "KDS_MAPPING_BRAND_UUID_INVALID"),
    store_uid: uuid(source_observation.store_uid, "KDS_MAPPING_STORE_UUID_INVALID")
  });

  const digest = evidenceDigest(source_observation.evidence_digest);

  return Object.freeze({
    branch,
    fabi_scope: scope,
    mapping_status: "source_verified",
    source_observed_at: observedAt(source_observation.source_observed_at),
    evidence_digest: digest,
    mapping_fingerprint: crypto.createHash("sha256")
      .update(JSON.stringify([branch.pos_parent, branch.pos_id, scope.company_uid, scope.brand_uid, scope.store_uid, digest]))
      .digest("hex")
  });
}

module.exports = {
  createSourceMappingEvidence
};
