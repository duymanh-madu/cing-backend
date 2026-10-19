"use strict";

/*
 * Cing KDS FABi C03 Recovery Window Provider V1
 *
 * C03 accepts epoch-millisecond start/end boundaries. A historical
 * reconciliation must search from the first durable C04 event through
 * the current retry instant. This preserves both possibilities for an
 * overnight online order: C03 may retain its original timestamp or
 * record the cashier's 08:00 confirmation timestamp.
 *
 * No calendar-day rounding is applied. UTC+7 is carried by the C03
 * transport's explicit x-client-timezone header, while epoch bounds
 * remain unambiguous across midnight.
 */

function providerError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function timestamp(value, code) {
  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw providerError(code);
  }

  return parsed;
}

function createFabiC03RecoveryWindowProviderV1({
  nowProvider
} = {}) {
  if (typeof nowProvider !== "function") {
    throw providerError(
      "C03_RECOVERY_NOW_PROVIDER_REQUIRED"
    );
  }

  return async function recoveryWindow({
    first_event_created_at,
    last_event_created_at
  } = {}) {
    const firstEvent = timestamp(
      first_event_created_at,
      "C03_RECOVERY_FIRST_EVENT_INVALID"
    );

    const lastEvent = timestamp(
      last_event_created_at,
      "C03_RECOVERY_LAST_EVENT_INVALID"
    );

    if (lastEvent < firstEvent) {
      throw providerError(
        "C03_RECOVERY_EVENT_WINDOW_REVERSED"
      );
    }

    const now = timestamp(
      await nowProvider(),
      "C03_RECOVERY_NOW_INVALID"
    );

    if (now < lastEvent) {
      throw providerError(
        "C03_RECOVERY_NOW_BEFORE_EVENTS"
      );
    }

    return Object.freeze({
      startDate: firstEvent,
      endDate: now
    });
  };
}

module.exports = {
  createFabiC03RecoveryWindowProviderV1
};
