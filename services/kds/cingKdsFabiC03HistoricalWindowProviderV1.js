"use strict";

/*
 * C03 historical-window contract.
 *
 * A retry is allowed to search by its durable C04 event history,
 * never by a transient "current polling" window.  Timezone and
 * FABi business-day policy remain injected by the activation
 * boundary; this wrapper verifies that the result actually covers
 * the durable event interval it was asked to recover.
 */

function providerError(code) {
  const error =
    new Error(code);

  error.code =
    code;

  return error;
}

function requiredString(value, code) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw providerError(code);
  }

  return value.trim();
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

function createFabiC03HistoricalWindowProviderV1({
  windowProvider
} = {}) {
  if (typeof windowProvider !== "function") {
    throw providerError(
      "C03_HISTORICAL_WINDOW_PROVIDER_REQUIRED"
    );
  }

  return async function historicalWindow(input = {}) {
    const firstEvent =
      timestamp(
        input.first_event_created_at,
        "C03_HISTORICAL_FIRST_EVENT_INVALID"
      );

    const lastEvent =
      timestamp(
        input.last_event_created_at,
        "C03_HISTORICAL_LAST_EVENT_INVALID"
      );

    if (lastEvent < firstEvent) {
      throw providerError(
        "C03_HISTORICAL_EVENT_WINDOW_REVERSED"
      );
    }

    const raw =
      await windowProvider({
        tran_id:
          requiredString(
            input.tran_id,
            "C03_HISTORICAL_TRAN_ID_REQUIRED"
          ),

        tran_no:
          input.tran_no === null ||
          input.tran_no === undefined
            ? null
            : requiredString(
                input.tran_no,
                "C03_HISTORICAL_TRAN_NO_INVALID"
              ),

        first_event_created_at:
          firstEvent,

        last_event_created_at:
          lastEvent
      });

    if (
      !raw ||
      typeof raw !== "object"
    ) {
      throw providerError(
        "C03_HISTORICAL_WINDOW_INVALID"
      );
    }

    const startDate =
      timestamp(
        raw.startDate,
        "C03_HISTORICAL_START_INVALID"
      );

    const endDate =
      timestamp(
        raw.endDate,
        "C03_HISTORICAL_END_INVALID"
      );

    if (
      endDate < startDate
    ) {
      throw providerError(
        "C03_HISTORICAL_WINDOW_REVERSED"
      );
    }

    if (
      startDate > firstEvent ||
      endDate < lastEvent
    ) {
      throw providerError(
        "C03_HISTORICAL_WINDOW_DOES_NOT_COVER_EVENTS"
      );
    }

    return Object.freeze({
      startDate,
      endDate
    });
  };
}

module.exports = {
  createFabiC03HistoricalWindowProviderV1
};
