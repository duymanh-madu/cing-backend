"use strict";

function evaluateSla({
  startedAt,
  completedAt = null,
  now,
  warningMinutes,
  criticalMinutes
}) {
  if (
    !Number.isSafeInteger(warningMinutes) ||
    !Number.isSafeInteger(criticalMinutes) ||
    warningMinutes <= 0 ||
    criticalMinutes <= warningMinutes
  ) {
    throw new Error("KDS_INVALID_SLA_POLICY");
  }

  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt || now).getTime();

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start
  ) {
    throw new Error("KDS_INVALID_SLA_TIME");
  }

  const elapsedMs = end - start;
  const elapsedMinutes = elapsedMs / 60000;

  let severity = "normal";

  if (elapsedMinutes >= criticalMinutes) {
    severity = "critical";
  } else if (elapsedMinutes >= warningMinutes) {
    severity = "warning";
  }

  return {
    elapsed_ms: elapsedMs,
    elapsed_minutes: elapsedMinutes,
    severity,
    completed: Boolean(completedAt),
    breached: severity !== "normal"
  };
}

module.exports = { evaluateSla };
