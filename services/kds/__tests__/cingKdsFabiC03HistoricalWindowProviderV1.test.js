"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  createFabiC03HistoricalWindowProviderV1
} = require(
  "../cingKdsFabiC03HistoricalWindowProviderV1"
);

const INPUT = Object.freeze({
  tran_id: "TRAN-OLD",
  tran_no: "100001",
  first_event_created_at: 1_000,
  last_event_created_at: 2_000
});

test(
  "forwards durable transaction history to the policy provider",
  async () => {
    let seen = null;

    const provider =
      createFabiC03HistoricalWindowProviderV1({
        windowProvider:
          async input => {
            seen = input;
            return {
              startDate: 900,
              endDate: 2_100
            };
          }
      });

    const result =
      await provider(INPUT);

    assert.deepEqual(seen, INPUT);
    assert.deepEqual(result, {
      startDate: 900,
      endDate: 2_100
    });
  }
);

test(
  "rejects a current-only window that omits an old durable event",
  async () => {
    const provider =
      createFabiC03HistoricalWindowProviderV1({
        windowProvider:
          async () => ({
            startDate: 1_500,
            endDate: 2_100
          })
      });

    await assert.rejects(
      provider(INPUT),
      /C03_HISTORICAL_WINDOW_DOES_NOT_COVER_EVENTS/
    );
  }
);

test(
  "reversed durable event interval fails before policy execution",
  async () => {
    let calls = 0;

    const provider =
      createFabiC03HistoricalWindowProviderV1({
        windowProvider:
          async () => {
            calls++;
            return {
              startDate: 0,
              endDate: 9_999
            };
          }
      });

    await assert.rejects(
      provider({
        ...INPUT,
        first_event_created_at: 3_000,
        last_event_created_at: 2_000
      }),
      /C03_HISTORICAL_EVENT_WINDOW_REVERSED/
    );

    assert.equal(calls, 0);
  }
);
