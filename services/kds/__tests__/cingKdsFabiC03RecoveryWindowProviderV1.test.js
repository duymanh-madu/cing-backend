"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  createFabiC03RecoveryWindowProviderV1
} = require(
  "../cingKdsFabiC03RecoveryWindowProviderV1"
);

test(
  "overnight order window reaches its 08:00 confirmation retry",
  async () => {
    const firstEvent =
      Date.UTC(2026, 9, 18, 16, 30, 0);
    const openingRetry =
      Date.UTC(2026, 9, 19, 1, 0, 0);

    const provider =
      createFabiC03RecoveryWindowProviderV1({
        nowProvider:
          async () =>
            openingRetry
      });

    assert.deepEqual(
      await provider({
        first_event_created_at:
          firstEvent,
        last_event_created_at:
          firstEvent
      }),
      {
        startDate: firstEvent,
        endDate: openingRetry
      }
    );
  }
);

test(
  "outage recovery retains older history through current retry",
  async () => {
    const provider =
      createFabiC03RecoveryWindowProviderV1({
        nowProvider:
          async () => 9_000
      });

    assert.deepEqual(
      await provider({
        first_event_created_at: 1_000,
        last_event_created_at: 2_000
      }),
      {
        startDate: 1_000,
        endDate: 9_000
      }
    );
  }
);

test(
  "clock regression fails closed rather than hiding durable event",
  async () => {
    const provider =
      createFabiC03RecoveryWindowProviderV1({
        nowProvider:
          async () => 1_999
      });

    await assert.rejects(
      provider({
        first_event_created_at: 1_000,
        last_event_created_at: 2_000
      }),
      /C03_RECOVERY_NOW_BEFORE_EVENTS/
    );
  }
);

test(
  "construction performs no clock read",
  () => {
    let calls = 0;

    createFabiC03RecoveryWindowProviderV1({
      nowProvider:
        async () => {
          calls++;
          return 1;
        }
    });

    assert.equal(calls, 0);
  }
);
