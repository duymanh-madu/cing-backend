"use strict";

const TRANSITIONS = Object.freeze({
  pending: ["preparing"],
  preparing: ["prepared"],
  prepared: ["served"],
  served: []
});

function transitionCup({
  cup,
  targetStatus,
  actorId,
  actionKey,
  expectedVersion,
  now
}) {
  if (!cup || typeof cup !== "object") {
    throw new Error("KDS_CUP_REQUIRED");
  }

  if (!actorId || !actionKey) {
    throw new Error("KDS_AUDIT_IDENTITY_REQUIRED");
  }

  if (
    !Number.isSafeInteger(cup.version) ||
    cup.version < 0 ||
    expectedVersion !== cup.version
  ) {
    throw new Error("KDS_VERSION_CONFLICT");
  }

  if (
    !TRANSITIONS[cup.status] ||
    !TRANSITIONS[cup.status].includes(targetStatus)
  ) {
    throw new Error("KDS_INVALID_TRANSITION");
  }

  const occurredAt = new Date(now);

  if (!Number.isFinite(occurredAt.getTime())) {
    throw new Error("KDS_INVALID_TIME");
  }

  const next = {
    ...cup,
    status: targetStatus,
    version: cup.version + 1
  };

  return {
    cup: next,
    audit: {
      action_key: String(actionKey),
      actor_id: String(actorId),
      from_status: cup.status,
      to_status: targetStatus,
      previous_version: cup.version,
      new_version: next.version,
      occurred_at: occurredAt.toISOString()
    }
  };
}

module.exports = {
  TRANSITIONS,
  transitionCup
};
