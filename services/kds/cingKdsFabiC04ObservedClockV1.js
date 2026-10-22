"use strict";

const { normalizeFabiC04EventV1 } = require("./cingKdsFabiC04EventNormalizerV1");

function fail() {
  const error = new Error("C04_CLOCK_REVIEW_REQUIRED");
  error.code = "C04_CLOCK_REVIEW_REQUIRED";
  throw error;
}

// Explicit contract observed on 2026-10-22: formatted fields are Vietnam
// wall time; numeric log fields encode that wall time as UTC seconds.
// This module is opt-in. It does not change V1 event bytes or fingerprints.
function parsePair(seconds, formatted) {
  if (!Number.isSafeInteger(seconds) || seconds < 0 ||
      typeof formatted !== "string") fail();
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}):(\d{6})$/.exec(formatted);
  if (!match) fail();
  const [, year, month, day, hour, minute, second, fraction] = match;
  if (Number(year) < 2000 || Number(year) > 2099) fail();
  const wall = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  const roundtrip = new Date(wall).toISOString().slice(0, 19);
  if (roundtrip !== `${year}-${month}-${day}T${hour}:${minute}:${second}` ||
      wall / 1000 !== seconds) fail();
  const epochMicroseconds = BigInt(wall - 25200000) * 1000n + BigInt(fraction);
  return Object.freeze({
    raw_seconds: seconds,
    raw_formatted: formatted,
    epoch_microseconds: epochMicroseconds.toString(),
    epoch_milliseconds: Number(epochMicroseconds / 1000n),
    utc_iso_microseconds: new Date(wall - 25200000).toISOString().slice(0, 19) +
      `.${fraction}Z`
  });
}

function interpretFabiC04ObservedClockV1(record) {
  const created = parsePair(record?.created_at, record?.fmt_created_at);
  const updated = parsePair(record?.updated_at, record?.fmt_updated_at);
  if (BigInt(updated.epoch_microseconds) < BigInt(created.epoch_microseconds)) fail();
  if (!Number.isSafeInteger(record.start_date) || record.start_date < 0) fail();
  return Object.freeze({
    schema_version: "cing_kds_c04_observed_clock_v1",
    source_timezone: "Asia/Ho_Chi_Minh",
    convention: "vietnam_wall_encoded_as_utc_seconds",
    created,
    updated,
    source_start_date_ms: record.start_date,
    // No assertion that start_date is the same event clock.
    runtime_checkpoint_authority: false
  });
}

function normalizeFabiC04ObservedEnvelopeV1(record) {
  const clock = interpretFabiC04ObservedClockV1(record);
  const event = normalizeFabiC04EventV1(record);
  return Object.freeze({ event, clock });
}

function interpretFabiC04NormalizedClockV1(event) {
  if (event?.schema_version !== "cing_kds_fabi_c04_event_v1" ||
      event?.source !== "fabi_c04_sale_change_log") fail();
  return parsePair(event.event_created_at, event.event_time_iso);
}

module.exports = {
  interpretFabiC04ObservedClockV1,
  interpretFabiC04NormalizedClockV1,
  normalizeFabiC04ObservedEnvelopeV1
};
