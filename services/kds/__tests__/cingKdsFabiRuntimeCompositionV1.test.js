"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  createFabiKdsRuntimeCompositionV1
} = require(
  "../cingKdsFabiRuntimeCompositionV1"
);

function baseDeps(
  overrides = {}
) {
  let c04Calls = 0;
  let c03Calls = 0;
  let writeCalls = 0;
  let readCalls = 0;
  let scopeCalls = 0;
  let windowCalls = 0;

  const deps = {
    c04HttpClient: {
      getSaleChangeLog:
        async ({
          page
        }) => {
          c04Calls++;

          return {
            rows: [],
            page
          };
        }
    },

    c04ScopeProvider:
      async () => {
        scopeCalls++;

        return {
          company_uid:
            "COMPANY",

          brand_uid:
            "BRAND",

          store_uid:
            "STORE"
        };
      },

    c04WindowProvider:
      async () => {
        windowCalls++;

        return {
          start_date:
            1,

          end_date:
            2,

          next_cursor:
            "NEXT"
        };
      },

    durableDbAdapter: {
      invokeRpc:
        async () => {
          writeCalls++;

          return {
            result:
              "inserted",

            inbox_id:
              1,

            observation_count:
              1
          };
        },

      loadDurableEvents:
        async ({
          scope
        }) => {
          readCalls++;

          assert.deepEqual(
            scope,
            {
              company_uid:
                "COMPANY",

              brand_uid:
                "BRAND",

              store_uid:
                "STORE"
            }
          );

          return [];
        }
    },

    c03HttpClient: {
      getSaleDetail:
        async () => {
          c03Calls++;

          return {
            data: []
          };
        }
    },

    c03ScopeProvider:
      async () => ({
        company_uid:
          "COMPANY",

        brand_uid:
          "BRAND",

        store_uid:
          "STORE"
      }),

    c03WindowProvider:
      async () => ({
        start_date:
          1,

        end_date:
          2
      }),

    ...overrides
  };

  return {
    deps,

    counts:
      () => ({
        c04Calls,
        c03Calls,
        writeCalls,
        readCalls,
        scopeCalls,
        windowCalls
      })
  };
}

test(
  "construction requires C04 HTTP capability",
  () => {
    const {
      deps
    } =
      baseDeps({
        c04HttpClient:
          null
      });

    assert.throws(
      () =>
        createFabiKdsRuntimeCompositionV1(
          deps
        ),
      /KDS_RUNTIME_C04_HTTP_REQUIRED/
    );
  }
);

test(
  "construction requires C04 scope provider",
  () => {
    const {
      deps
    } =
      baseDeps({
        c04ScopeProvider:
          null
      });

    assert.throws(
      () =>
        createFabiKdsRuntimeCompositionV1(
          deps
        ),
      /KDS_RUNTIME_C04_SCOPE_PROVIDER_REQUIRED/
    );
  }
);

test(
  "construction requires C04 window provider",
  () => {
    const {
      deps
    } =
      baseDeps({
        c04WindowProvider:
          null
      });

    assert.throws(
      () =>
        createFabiKdsRuntimeCompositionV1(
          deps
        ),
      /KDS_RUNTIME_C04_WINDOW_PROVIDER_REQUIRED/
    );
  }
);

test(
  "construction requires exact durable write and read capabilities",
  () => {
    {
      const {
        deps
      } =
        baseDeps({
          durableDbAdapter: {
            loadDurableEvents:
              async () => []
          }
        });

      assert.throws(
        () =>
          createFabiKdsRuntimeCompositionV1(
            deps
          ),
        /KDS_RUNTIME_DURABLE_WRITE_REQUIRED/
      );
    }

    {
      const {
        deps
      } =
        baseDeps({
          durableDbAdapter: {
            invokeRpc:
              async () => ({})
          }
        });

      assert.throws(
        () =>
          createFabiKdsRuntimeCompositionV1(
            deps
          ),
        /KDS_RUNTIME_DURABLE_READ_REQUIRED/
      );
    }
  }
);

test(
  "construction requires C03 HTTP capability",
  () => {
    const {
      deps
    } =
      baseDeps({
        c03HttpClient:
          null
      });

    assert.throws(
      () =>
        createFabiKdsRuntimeCompositionV1(
          deps
        ),
      /KDS_RUNTIME_C03_HTTP_REQUIRED/
    );
  }
);

test(
  "construction requires C03 scope and window providers",
  () => {
    {
      const {
        deps
      } =
        baseDeps({
          c03ScopeProvider:
            null
        });

      assert.throws(
        () =>
          createFabiKdsRuntimeCompositionV1(
            deps
          ),
        /KDS_RUNTIME_C03_SCOPE_PROVIDER_REQUIRED/
      );
    }

    {
      const {
        deps
      } =
        baseDeps({
          c03WindowProvider:
            null
        });

      assert.throws(
        () =>
          createFabiKdsRuntimeCompositionV1(
            deps
          ),
        /KDS_RUNTIME_C03_WINDOW_PROVIDER_REQUIRED/
      );
    }
  }
);

test(
  "construction performs zero network and database I/O",
  () => {
    const {
      deps,
      counts
    } =
      baseDeps();

    const runtime =
      createFabiKdsRuntimeCompositionV1(
        deps
      );

    assert.equal(
      typeof runtime.poll,
      "function"
    );

    assert.equal(
      typeof runtime.status,
      "function"
    );

    assert.equal(
      typeof runtime.close,
      "function"
    );

    assert.deepEqual(
      counts(),
      {
        c04Calls:
          0,

        c03Calls:
          0,

        writeCalls:
          0,

        readCalls:
          0,

        scopeCalls:
          0,

        windowCalls:
          0
      }
    );
  }
);

test(
  "empty C04 poll performs no durable or C03 work",
  async () => {
    const {
      deps,
      counts
    } =
      baseDeps();

    const runtime =
      createFabiKdsRuntimeCompositionV1(
        deps
      );

    const result =
      await runtime.poll();

    assert.equal(
      result.fetched_event_count,
      0
    );

    assert.equal(
      result.durable_event_count,
      0
    );

    assert.deepEqual(
      result.transactions,
      []
    );

    assert.equal(
      result.next_cursor,
      "NEXT"
    );

    assert.deepEqual(
      counts(),
      {
        /*
         * Page 1 empty is the only C04 transport call.
         */
        c04Calls:
          1,

        c03Calls:
          0,

        writeCalls:
          0,

        readCalls:
          0,

        scopeCalls:
          1,

        windowCalls:
          1
      }
    );
  }
);

test(
  "runtime lifecycle is coordinator lifecycle only",
  async () => {
    const {
      deps
    } =
      baseDeps();

    const runtime =
      createFabiKdsRuntimeCompositionV1(
        deps
      );

    assert.deepEqual(
      runtime.status(),
      {
        running:
          false,

        closed:
          false
      }
    );

    runtime.close();

    assert.deepEqual(
      runtime.status(),
      {
        running:
          false,

        closed:
          true
      }
    );

    await assert.rejects(
      runtime.poll(),
      /C04_INGEST_CLOSED/
    );
  }
);

test(
  "composition exposes no scheduler start or server mount method",
  () => {
    const {
      deps
    } =
      baseDeps();

    const runtime =
      createFabiKdsRuntimeCompositionV1(
        deps
      );

    assert.deepEqual(
      Object.keys(runtime)
        .sort(),
      [
        "close",
        "poll",
        "status"
      ]
    );

    assert.equal(
      runtime.start,
      undefined
    );

    assert.equal(
      runtime.listen,
      undefined
    );

    assert.equal(
      runtime.mount,
      undefined
    );
  }
);
