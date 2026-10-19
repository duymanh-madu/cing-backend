"use strict";

/*
 * Cing KDS FABi Closed-Hours Policy V1
 *
 * Physical operation is closed from 23:00 inclusive until 08:00
 * exclusive in Vietnam time (UTC+7). Online orders are retained by
 * durable C04 ingestion, but C03 paid-final reconciliation is deferred
 * until opening. This module owns no clock and no I/O.
 */

const VIETNAM_OFFSET_MS =
  7 * 60 * 60 * 1000;

const MAX_DEFER_SECONDS =
  9 * 60 * 60;

function policyError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function nonnegativeInteger(value, code) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw policyError(code);
  }

  return number;
}

function reopenUtcMs(nowMs) {
  const local = new Date(nowMs + VIETNAM_OFFSET_MS);
  const reopenLocalMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() +
      (local.getUTCHours() >= 23 ? 1 : 0),
    8,
    0,
    0,
    0
  );

  return reopenLocalMs - VIETNAM_OFFSET_MS;
}

function planFabiKdsClosedHoursV1({
  now_ms
} = {}) {
  const nowMs = nonnegativeInteger(
    now_ms,
    "KDS_CLOSED_HOURS_NOW_INVALID"
  );

  const local = new Date(nowMs + VIETNAM_OFFSET_MS);
  const hour = local.getUTCHours();
  const closed = hour >= 23 || hour < 8;

  if (!closed) {
    return Object.freeze({
      eligible: true,
      retry_delay_seconds: null
    });
  }

  const delay = Math.ceil(
    (reopenUtcMs(nowMs) - nowMs) / 1000
  );

  if (delay < 1 || delay > MAX_DEFER_SECONDS) {
    throw policyError(
      "KDS_CLOSED_HOURS_DELAY_INVALID"
    );
  }

  return Object.freeze({
    eligible: false,
    retry_delay_seconds: delay
  });
}

module.exports = {
  MAX_DEFER_SECONDS,
  planFabiKdsClosedHoursV1
};
