"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  createFabiC03FinalFetchBridgeV1
} = require(
  "../cingKdsFabiC03FinalFetchBridgeV1"
);

const INPUT = {
  tran_id:
    "TRAN-63E",

  tran_no:
    "100001",

  first_event_created_at:
    100,

  last_event_created_at:
    200
};

function scope() {
  return {
    companyUid:
      "COMPANY",

    brandUid:
      "BRAND",

    storeUid:
      "STORE"
  };
}

function window() {
  return {
    startDate:
      1000,

    endDate:
      2000
  };
}

function sale(
  overrides = {}
) {
  return {
    tran_id:
      "TRAN-63E",

    tran_no:
      "100001",

    sale_detail: [],

    ...overrides
  };
}

function client({
  data = [],
  onCall
} = {}) {
  return {
    getSaleDetail:
      async args => {
        if (onCall) {
          onCall(args);
        }

        return {
          source:
            "fabi_c03_sale_by_date_csv",

          expanded:
            true,

          data,

          track_id:
            "TRACK"
        };
      }
  };
}

test(
  "requires exact C03 HTTP client capability",
  () => {
    assert.throws(
      () =>
        createFabiC03FinalFetchBridgeV1({
          scopeProvider:
            async () =>
              scope(),

          windowProvider:
            async () =>
              window()
        }),
      /C03_FINAL_BRIDGE_HTTP_CLIENT_REQUIRED/
    );
  }
);

test(
  "requires injected scope provider",
  () => {
    assert.throws(
      () =>
        createFabiC03FinalFetchBridgeV1({
          httpClient:
            client(),

          windowProvider:
            async () =>
              window()
        }),
      /C03_FINAL_BRIDGE_SCOPE_PROVIDER_REQUIRED/
    );
  }
);

test(
  "requires injected date window provider",
  () => {
    assert.throws(
      () =>
        createFabiC03FinalFetchBridgeV1({
          httpClient:
            client(),

          scopeProvider:
            async () =>
              scope()
        }),
      /C03_FINAL_BRIDGE_WINDOW_PROVIDER_REQUIRED/
    );
  }
);

test(
  "construction performs no HTTP call",
  () => {
    let calls = 0;

    createFabiC03FinalFetchBridgeV1({
      httpClient:
        client({
          onCall:
            () => {
              calls++;
            }
        }),

      scopeProvider:
        async () =>
          scope(),

      windowProvider:
        async () =>
          window()
    });

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "bridge calls exact getSaleDetail contract",
  async () => {
    let received = null;

    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient:
          client({
            onCall:
              args => {
                received = args;
              }
          }),

        scopeProvider:
          async () =>
            scope(),

        windowProvider:
          async () =>
            window()
      });

    await bridge.fetchFinalInvoice(
      INPUT
    );

    assert.deepEqual(
      received,
      {
        companyUid:
          "COMPANY",

        brandUid:
          "BRAND",

        storeUid:
          "STORE",

        startDate:
          1000,

        endDate:
          2000,

        search:
          "100001",

        page:
          1,

        resultsPerPage:
          200,

        sort:
          "dsc",

        storeOpenAt:
          0
      }
    );
  }
);

test(
  "tran_no is preferred as C03 search value",
  async () => {
    let search = null;

    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient:
          client({
            onCall:
              args => {
                search =
                  args.search;
              }
          }),

        scopeProvider:
          async () =>
            scope(),

        windowProvider:
          async () =>
            window()
      });

    await bridge.fetchFinalInvoice(
      INPUT
    );

    assert.equal(
      search,
      "100001"
    );
  }
);

test(
  "tran_id is fallback search when tran_no unavailable",
  async () => {
    let search = null;

    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient:
          client({
            onCall:
              args => {
                search =
                  args.search;
              }
          }),

        scopeProvider:
          async () =>
            scope(),

        windowProvider:
          async () =>
            window()
      });

    await bridge.fetchFinalInvoice({
      ...INPUT,
      tran_no:
        null
    });

    assert.equal(
      search,
      "TRAN-63E"
    );
  }
);

test(
  "empty expanded C03 result becomes not_found",
  async () => {
    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient:
          client({
            data: []
          }),

        scopeProvider:
          async () =>
            scope(),

        windowProvider:
          async () =>
            window()
      });

    const result =
      await bridge.fetchFinalInvoice(
        INPUT
      );

    assert.equal(
      result.status,
      "not_found"
    );
  }
);

test(
  "search result with foreign tran_id is not accepted",
  async () => {
    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient:
          client({
            data: [
              sale({
                tran_id:
                  "OTHER"
              })
            ]
          }),

        scopeProvider:
          async () =>
            scope(),

        windowProvider:
          async () =>
            window()
      });

    const result =
      await bridge.fetchFinalInvoice(
        INPUT
      );

    assert.equal(
      result.status,
      "not_found"
    );
  }
);

test(
  "exact tran_id and tran_no are returned as found",
  async () => {
    const exact =
      sale();

    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient:
          client({
            data: [
              exact
            ]
          }),

        scopeProvider:
          async () =>
            scope(),

        windowProvider:
          async () =>
            window()
      });

    const result =
      await bridge.fetchFinalInvoice(
        INPUT
      );

    assert.equal(
      result.status,
      "found"
    );

    assert.equal(
      result.invoices.length,
      1
    );

    assert.equal(
      result.invoices[0],
      exact
    );
  }
);

test(
  "C03 tran_no suffix text is normalized only for exact comparison",
  async () => {
    const exact =
      sale({
        tran_no:
          "100001 EXTRA"
      });

    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient:
          client({
            data: [
              exact
            ]
          }),

        scopeProvider:
          async () =>
            scope(),

        windowProvider:
          async () =>
            window()
      });

    const result =
      await bridge.fetchFinalInvoice(
        INPUT
      );

    assert.equal(
      result.status,
      "found"
    );

    assert.equal(
      result.invoices.length,
      1
    );
  }
);

test(
  "matching tran_id but wrong tran_no is excluded",
  async () => {
    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient:
          client({
            data: [
              sale({
                tran_no:
                  "999999"
              })
            ]
          }),

        scopeProvider:
          async () =>
            scope(),

        windowProvider:
          async () =>
            window()
      });

    const result =
      await bridge.fetchFinalInvoice(
        INPUT
      );

    assert.equal(
      result.status,
      "not_found"
    );
  }
);

test(
  "multiple exact invoices are preserved for 63D ambiguity fail-closed",
  async () => {
    const a =
      sale();

    const b =
      sale();

    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient:
          client({
            data:
              [a, b]
          }),

        scopeProvider:
          async () =>
            scope(),

        windowProvider:
          async () =>
            window()
      });

    const result =
      await bridge.fetchFinalInvoice(
        INPUT
      );

    assert.equal(
      result.status,
      "found"
    );

    assert.equal(
      result.invoices.length,
      2
    );
  }
);

test(
  "invalid C03 detail response fails closed",
  async () => {
    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient: {
          getSaleDetail:
            async () => ({
              source:
                "wrong",
              expanded:
                true,
              data:
                []
            })
        },

        scopeProvider:
          async () =>
            scope(),

        windowProvider:
          async () =>
            window()
      });

    await assert.rejects(
      bridge.fetchFinalInvoice(
        INPUT
      ),
      /C03_FINAL_BRIDGE_DETAIL_INVALID/
    );
  }
);

test(
  "invalid branch scope fails before HTTP",
  async () => {
    let calls = 0;

    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient:
          client({
            onCall:
              () => {
                calls++;
              }
          }),

        scopeProvider:
          async () => ({
            companyUid:
              "COMPANY",
            brandUid:
              "",
            storeUid:
              "STORE"
          }),

        windowProvider:
          async () =>
            window()
      });

    await assert.rejects(
      bridge.fetchFinalInvoice(
        INPUT
      ),
      /C03_FINAL_BRIDGE_BRAND_REQUIRED/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "invalid date window fails before HTTP",
  async () => {
    let calls = 0;

    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient:
          client({
            onCall:
              () => {
                calls++;
              }
          }),

        scopeProvider:
          async () =>
            scope(),

        windowProvider:
          async () => ({
            startDate:
              2000,
            endDate:
              1000
          })
      });

    await assert.rejects(
      bridge.fetchFinalInvoice(
        INPUT
      ),
      /C03_FINAL_BRIDGE_WINDOW_REVERSED/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "bridge does not infer date from C04 timestamps itself",
  async () => {
    let providerInput = null;

    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient:
          client(),

        scopeProvider:
          async () =>
            scope(),

        windowProvider:
          async input => {
            providerInput = input;

            return window();
          }
      });

    await bridge.fetchFinalInvoice(
      INPUT
    );

    assert.deepEqual(
      providerInput,
      {
        tran_id:
          "TRAN-63E",

        tran_no:
          "100001",

        first_event_created_at:
          100,

        last_event_created_at:
          200
      }
    );
  }
);

test(
  "HTTP failure propagates so 63D can fail closed",
  async () => {
    const error =
      new Error(
        "C03_AUTH_REQUIRED"
      );

    error.code =
      "C03_AUTH_REQUIRED";

    const bridge =
      createFabiC03FinalFetchBridgeV1({
        httpClient: {
          getSaleDetail:
            async () => {
              throw error;
            }
        },

        scopeProvider:
          async () =>
            scope(),

        windowProvider:
          async () =>
            window()
      });

    await assert.rejects(
      bridge.fetchFinalInvoice(
        INPUT
      ),
      candidate =>
        candidate === error
    );
  }
);

test(
  "bridge result contains no customer projection logic",
  () => {
    const fs =
      require("node:fs");

    const source =
      fs.readFileSync(
        require.resolve(
          "../cingKdsFabiC03FinalFetchBridgeV1"
        ),
        "utf8"
      );

    assert.doesNotMatch(
      source,
      /customer_phone/
    );

    assert.doesNotMatch(
      source,
      /customer_email/
    );

    assert.doesNotMatch(
      source,
      /customer_address/
    );

    assert.doesNotMatch(
      source,
      /customer_name/
    );
  }
);
