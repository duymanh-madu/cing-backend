"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  planFabiKdsClosedHoursV1
} = require(
  "../cingKdsFabiClosedHoursPolicyV1"
);

test(
  "Vietnam closed hours defer C03 precisely until 08:00",
  () => {
    assert.deepEqual(
      planFabiKdsClosedHoursV1({
        now_ms:
          Date.UTC(2026, 9, 18, 16, 0, 0)
      }),
      {
        eligible: false,
        retry_delay_seconds: 32_400
      }
    );

    assert.deepEqual(
      planFabiKdsClosedHoursV1({
        now_ms:
          Date.UTC(2026, 9, 19, 0, 59, 59)
      }),
      {
        eligible: false,
        retry_delay_seconds: 1
      }
    );

    assert.deepEqual(
      planFabiKdsClosedHoursV1({
        now_ms:
          Date.UTC(2026, 9, 19, 1, 0, 0)
      }),
      {
        eligible: true,
        retry_delay_seconds: null
      }
    );
  }
);

test(
  "policy rejects an invalid injected clock",
  () => {
    assert.throws(
      () =>
        planFabiKdsClosedHoursV1({
          now_ms: -1
        }),
      /KDS_CLOSED_HOURS_NOW_INVALID/
    );
  }
);
