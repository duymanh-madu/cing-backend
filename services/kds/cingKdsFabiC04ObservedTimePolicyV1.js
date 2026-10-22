"use strict";

const { interpretFabiC04ObservedClockV1, interpretFabiC04NormalizedClockV1 } =
  require("./cingKdsFabiC04ObservedClockV1");
const { normalizeFabiC04EventV1 } = require("./cingKdsFabiC04EventNormalizerV1");
const { projectFabiC04StateV1 } = require("./cingKdsFabiC04SignedDeltaReducerV1");

const OBSERVED_TIME_CONVENTION = "vietnam_wall_encoded_as_utc_seconds_v1";

function resolveFabiC04TimePolicyV1(convention = "legacy") {
  if (convention === "legacy") return Object.freeze({
    normalizeEvent: normalizeFabiC04EventV1,
    projectState: projectFabiC04StateV1
  });
  if (convention !== OBSERVED_TIME_CONVENTION) {
    const error = new Error("KDS_C04_TIME_CONVENTION_INVALID");
    error.code = "KDS_C04_TIME_CONVENTION_INVALID";
    throw error;
  }
  return Object.freeze({
    normalizeEvent(record) {
      // Validate before any persistence, but preserve original V1 event bytes.
      interpretFabiC04ObservedClockV1(record);
      return normalizeFabiC04EventV1(record);
    },
    projectState(events) {
      // This also validates historical normalized events during durable reload.
      return projectFabiC04StateV1(events, {
        eventClock: interpretFabiC04NormalizedClockV1
      });
    }
  });
}

module.exports = { OBSERVED_TIME_CONVENTION, resolveFabiC04TimePolicyV1 };
