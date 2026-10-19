"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  CANDIDATE_LOG_TYPES,
  createFabiC04FetchAdapterV1
} = require(
  "../cingKdsFabiC04FetchAdapterV1"
);

function create({
  pages,
  window = {
    start_date:
      1000,

    end_date:
      2000,

    next_cursor:
      "cursor-next"
  },

  maxPages = 10
} = {}) {
  const calls = [];

  const adapter =
    createFabiC04FetchAdapterV1({
      httpClient: {
        getSaleChangeLog:
          async input => {
            calls.push(
              input
            );

            const rows =
              pages[
                input.page - 1
              ] ??
              [];

            return {
              rows,
              page:
                input.page
            };
          }
      },

      scopeProvider:
        async () => ({
          company_uid:
            "COMPANY",

          brand_uid:
            "BRAND",

          store_uid:
            "STORE"
        }),

      windowProvider:
        async ({
          cursor
        }) => ({
          ...window,

          seen_cursor:
            cursor
        }),

      maxPages
    });

  return {
    adapter,
    calls
  };
}

test(
  "exports exact two proven candidate log types",
  () => {
    assert.deepEqual(
      [
        ...CANDIDATE_LOG_TYPES
      ],
      [
        "SALE_CHANGE",
        "SALE_MERGE_ORDER"
      ]
    );
  }
);

test(
  "construction performs no HTTP call",
  () => {
    const {
      calls
    } =
      create({
        pages: []
      });

    assert.equal(
      calls.length,
      0
    );
  }
);

test(
  "fetches pages until explicit empty page",
  async () => {
    const {
      adapter,
      calls
    } =
      create({
        pages: [
          [
            {
              log_type:
                "SALE_CHANGE"
            }
          ],
          [
            {
              log_type:
                "SALE_MERGE_ORDER"
            }
          ],
          []
        ]
      });

    const result =
      await adapter
        .fetchEvents({
          cursor:
            "previous"
        });

    assert.equal(
      calls.length,
      3
    );

    assert.equal(
      result.events.length,
      2
    );

    assert.equal(
      result.next_cursor,
      "cursor-next"
    );
  }
);

test(
  "preserves SALE_MERGE_ORDER without source-type rewriting",
  async () => {
    const raw = {
      log_type:
        "SALE_MERGE_ORDER",

      tran_id:
        "TRAN-MERGE",

      sentinel:
        "unchanged"
    };

    const {
      adapter
    } =
      create({
        pages: [
          [
            raw
          ],
          []
        ]
      });

    const result =
      await adapter
        .fetchEvents();

    assert.equal(
      result.events[0],
      raw
    );

    assert.equal(
      result.events[0]
        .log_type,
      "SALE_MERGE_ORDER"
    );
  }
);

test(
  "PRINT_PROVISIONAL is excluded from state-authority event set",
  async () => {
    const {
      adapter
    } =
      create({
        pages: [
          [
            {
              log_type:
                "PRINT_PROVISIONAL_INVOICE"
            },
            {
              log_type:
                "SALE_CHANGE"
            }
          ],
          []
        ]
      });

    const result =
      await adapter
        .fetchEvents();

    assert.equal(
      result.events.length,
      1
    );

    assert.equal(
      result.events[0]
        .log_type,
      "SALE_CHANGE"
    );
  }
);

test(
  "other C04 log types are excluded",
  async () => {
    const {
      adapter
    } =
      create({
        pages: [
          [
            {
              log_type:
                "RE_PRINT_BILL"
            },
            {
              log_type:
                "LOG_USE_PIN"
            },
            {
              log_type:
                "SALE_MERGE_ORDER"
            }
          ],
          []
        ]
      });

    const result =
      await adapter
        .fetchEvents();

    assert.deepEqual(
      result.events.map(
        row =>
          row.log_type
      ),
      [
        "SALE_MERGE_ORDER"
      ]
    );
  }
);

test(
  "scope is forwarded exactly to every page",
  async () => {
    const {
      adapter,
      calls
    } =
      create({
        pages: [
          [
            {
              log_type:
                "SALE_CHANGE"
            }
          ],
          []
        ]
      });

    await adapter
      .fetchEvents();

    for (
      const call
      of calls
    ) {
      assert.equal(
        call.company_uid,
        "COMPANY"
      );

      assert.equal(
        call.brand_uid,
        "BRAND"
      );

      assert.equal(
        call.store_uid,
        "STORE"
      );

      assert.equal(
        call.start_date,
        1000
      );

      assert.equal(
        call.end_date,
        2000
      );
    }
  }
);

test(
  "cursor is not interpreted as source completeness authority",
  async () => {
    let received;

    const adapter =
      createFabiC04FetchAdapterV1({
        httpClient: {
          getSaleChangeLog:
            async ({
              page
            }) => ({
              rows:
                page === 1
                  ? []
                  : [],

              page
            })
        },

        scopeProvider:
          async () => ({
            company_uid:
              "COMPANY",

            brand_uid:
              "BRAND",

            store_uid:
              "STORE"
          }),

        windowProvider:
          async input => {
            received =
              input;

            return {
              start_date:
                500,

              end_date:
                1000,

              next_cursor: {
                watermark:
                  1000
              }
            };
          }
      });

    const prior = {
      watermark:
        900
    };

    const result =
      await adapter
        .fetchEvents({
          cursor:
            prior
        });

    assert.equal(
      received.cursor,
      prior
    );

    assert.deepEqual(
      result.next_cursor,
      {
        watermark:
          1000
      }
    );
  }
);

test(
  "page ceiling cannot silently claim completeness",
  async () => {
    const {
      adapter
    } =
      create({
        pages: [
          [
            {
              log_type:
                "SALE_CHANGE"
            }
          ],
          [
            {
              log_type:
                "SALE_CHANGE"
            }
          ]
        ],

        maxPages:
          2
      });

    await assert.rejects(
      adapter.fetchEvents(),
      /C04_FETCH_PAGE_LIMIT_REACHED/
    );
  }
);

test(
  "invalid scope fails before HTTP",
  async () => {
    let calls = 0;

    const adapter =
      createFabiC04FetchAdapterV1({
        httpClient: {
          getSaleChangeLog:
            async () => {
              calls++;
            }
        },

        scopeProvider:
          async () => ({
            company_uid:
              "",
            brand_uid:
              "BRAND",
            store_uid:
              "STORE"
          }),

        windowProvider:
          async () => ({
            start_date:
              1,
            end_date:
              2
          })
      });

    await assert.rejects(
      adapter.fetchEvents(),
      /C04_FETCH_COMPANY_REQUIRED/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "invalid window fails before HTTP",
  async () => {
    let calls = 0;

    const adapter =
      createFabiC04FetchAdapterV1({
        httpClient: {
          getSaleChangeLog:
            async () => {
              calls++;
            }
        },

        scopeProvider:
          async () => ({
            company_uid:
              "COMPANY",
            brand_uid:
              "BRAND",
            store_uid:
              "STORE"
          }),

        windowProvider:
          async () => ({
            start_date:
              3,
            end_date:
              2
          })
      });

    await assert.rejects(
      adapter.fetchEvents(),
      /C04_FETCH_WINDOW_REVERSED/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "HTTP adapter errors propagate fail-closed",
  async () => {
    const adapter =
      createFabiC04FetchAdapterV1({
        httpClient: {
          getSaleChangeLog:
            async () => {
              const error =
                new Error(
                  "C04_RATE_LIMITED"
                );

              error.code =
                "C04_RATE_LIMITED";

              throw error;
            }
        },

        scopeProvider:
          async () => ({
            company_uid:
              "COMPANY",
            brand_uid:
              "BRAND",
            store_uid:
              "STORE"
          }),

        windowProvider:
          async () => ({
            start_date:
              1,
            end_date:
              2
          })
      });

    await assert.rejects(
      adapter.fetchEvents(),
      /C04_RATE_LIMITED/
    );
  }
);
