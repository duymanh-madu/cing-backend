"use strict";

const SHADOW_PILOT_CONFIRMATION =
  "CING_KDS_SHADOW_PILOT_RUN_ONCE_V1";

const SHADOW_TARGET = Object.freeze({
  pos_parent: "BRAND-DQIR",
  pos_id: "109664"
});

function policyError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredString(value, code) {
  if (typeof value !== "string" || !value.trim()) {
    throw policyError(code);
  }
  return value.trim();
}

function validUuid(value, code) {
  const text = requiredString(value, code);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw policyError(code);
  }
  return text;
}

function validateTarget(target) {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    throw policyError("KDS_SHADOW_TARGET_REQUIRED");
  }

  const normalized = Object.freeze({
    pos_parent: requiredString(target.pos_parent, "KDS_SHADOW_POS_PARENT_REQUIRED"),
    pos_id: requiredString(target.pos_id, "KDS_SHADOW_POS_ID_REQUIRED")
  });

  if (
    normalized.pos_parent !== SHADOW_TARGET.pos_parent ||
    normalized.pos_id !== SHADOW_TARGET.pos_id
  ) {
    throw policyError("KDS_SHADOW_TARGET_NOT_APPROVED");
  }

  return normalized;
}

function validateFabiScope(scope) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    throw policyError("KDS_SHADOW_FABI_SCOPE_REQUIRED");
  }

  return Object.freeze({
    company_uid: validUuid(scope.company_uid, "KDS_SHADOW_FABI_COMPANY_INVALID"),
    brand_uid: validUuid(scope.brand_uid, "KDS_SHADOW_FABI_BRAND_INVALID"),
    store_uid: validUuid(scope.store_uid, "KDS_SHADOW_FABI_STORE_INVALID")
  });
}

function validateShadowPilotScope({ target, fabi_scope } = {}) {
  return Object.freeze({
    target: validateTarget(target),
    fabi_scope: validateFabiScope(fabi_scope),
    mapping_status: "configured_not_source_verified"
  });
}

module.exports = {
  SHADOW_PILOT_CONFIRMATION,
  SHADOW_TARGET,
  validateShadowPilotScope
};
