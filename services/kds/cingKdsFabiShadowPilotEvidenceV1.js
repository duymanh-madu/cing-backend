"use strict";

const {
  validateShadowPilotScope
} = require("./cingKdsFabiShadowPilotPolicyV1");

function evidenceError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function nonnegative(value, code) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw evidenceError(code);
  }
  return number;
}

function boundedDuration(value) {
  const duration = nonnegative(value, "KDS_SHADOW_DURATION_INVALID");
  if (duration >= 120_000) {
    throw evidenceError("KDS_SHADOW_DURATION_INVALID");
  }
  return duration;
}

function metrics(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw evidenceError(`KDS_SHADOW_${name}_METRICS_INVALID`);
  }
  return Object.freeze({
    count: nonnegative(value.count, `KDS_SHADOW_${name}_COUNT_INVALID`),
    timeout_count: nonnegative(value.timeout_count, `KDS_SHADOW_${name}_TIMEOUT_INVALID`),
    max_duration_ms: nonnegative(value.max_duration_ms, `KDS_SHADOW_${name}_MAX_DURATION_INVALID`)
  });
}

function runner(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return Object.freeze({
    status: typeof value.status === "string" ? value.status : "invalid",
    polled: value.polled === true,
    checkpoint_committed: value.checkpoint_committed === true,
    transaction_count: nonnegative(value.transaction_count, "KDS_SHADOW_TRANSACTION_COUNT_INVALID"),
    fetched_event_count: nonnegative(value.fetched_event_count, "KDS_SHADOW_FETCHED_EVENT_COUNT_INVALID"),
    durable_event_count: nonnegative(value.durable_event_count, "KDS_SHADOW_DURABLE_EVENT_COUNT_INVALID"),
    retries_claimed: nonnegative(value.retries_claimed, "KDS_SHADOW_RETRIES_CLAIMED_INVALID"),
    retries_resolved: nonnegative(value.retries_resolved, "KDS_SHADOW_RETRIES_RESOLVED_INVALID")
  });
}

function safeCode(value) {
  return typeof value === "string" && /^[A-Z0-9_]{3,120}$/.test(value)
    ? value
    : "KDS_SHADOW_PROOF_INVALID";
}

function createShadowPilotEvidence({ observation_key, scope, proof } = {}) {
  const normalizedScope = validateShadowPilotScope(scope);
  if (typeof observation_key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(observation_key)) {
    throw evidenceError("KDS_SHADOW_OBSERVATION_KEY_INVALID");
  }
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
    throw evidenceError("KDS_SHADOW_PROOF_REQUIRED");
  }

  const normalizedRunner = runner(proof.runner);
  const completed = proof.status === "completed" &&
    proof.error_code === null &&
    normalizedRunner?.status === "committed" &&
    normalizedRunner.checkpoint_committed === true;

  return Object.freeze({
    observation_key,
    pos_parent: normalizedScope.target.pos_parent,
    pos_id: normalizedScope.target.pos_id,
    company_uid: normalizedScope.fabi_scope.company_uid,
    brand_uid: normalizedScope.fabi_scope.brand_uid,
    store_uid: normalizedScope.fabi_scope.store_uid,
    mapping_status: normalizedScope.mapping_status,
    status: completed ? "observed" : "hold",
    error_code: completed ? null : safeCode(proof.error_code),
    duration_ms: boundedDuration(proof.duration_ms),
    c03: metrics(proof.c03, "C03"),
    c04: metrics(proof.c04, "C04"),
    runner: normalizedRunner
  });
}

module.exports = {
  createShadowPilotEvidence
};
