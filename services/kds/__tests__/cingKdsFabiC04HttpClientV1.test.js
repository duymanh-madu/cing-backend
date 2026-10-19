"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  ORIGIN,
  PATH,
  createFabiC04HttpClientV1
} = require(
  "../cingKdsFabiC04HttpClientV1"
);

function factory({
  auth = "Bearer test",
  access = "app-test",
  requestFn
} = {}) {
  return createFabiC04HttpClientV1({
    authProvider:
      async () =>
        auth,

    appAccessTokenProvider:
      async () =>
        access,

    requestFn:
      requestFn ||
      (async () => ({
        status:
          200,

        body: {
          data: []
        }
      }))
  });
}

const QUERY = {
  company_uid:
    "COMPANY",

  brand_uid:
    "BRAND",

  store_uid:
    "STORE",

  start_date:
    1000,

  end_date:
    2000,

  page:
    2
};

test(
  "exports exact C04 endpoint",
  () => {
    assert.equal(
      ORIGIN,
      "https://posapi.ipos.vn"
    );

    assert.equal(
      PATH,
      "/api/v3/pos-cms/sale-change-log"
    );
  }
);

test(
  "construction performs no network request",
  () => {
    let calls = 0;

    factory({
      requestFn:
        async () => {
          calls++;

          return {
            status: 200,
            body: {
              data: []
            }
          };
        }
    });

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "uses exact sale-change-log query contract",
  async () => {
    let invocation;

    const client =
      factory({
        requestFn:
          async input => {
            invocation =
              input;

            return {
              status:
                200,

              body: {
                data: [
                  {
                    log_type:
                      "SALE_CHANGE"
                  }
                ]
              }
            };
          }
      });

    const result =
      await client
        .getSaleChangeLog(
          QUERY
        );

    const url =
      new URL(
        invocation.url
      );

    assert.equal(
      invocation.method,
      "GET"
    );

    assert.equal(
      url.origin,
      ORIGIN
    );

    assert.equal(
      url.pathname,
      PATH
    );

    assert.equal(
      url.searchParams.get(
        "company_uid"
      ),
      "COMPANY"
    );

    assert.equal(
      url.searchParams.get(
        "brand_uid"
      ),
      "BRAND"
    );

    assert.equal(
      url.searchParams.get(
        "store_uid"
      ),
      "STORE"
    );

    assert.equal(
      url.searchParams.get(
        "start_date"
      ),
      "1000"
    );

    assert.equal(
      url.searchParams.get(
        "end_date"
      ),
      "2000"
    );

    assert.equal(
      url.searchParams.get(
        "page"
      ),
      "2"
    );

    assert.equal(
      url.searchParams.get(
        "store_open_at"
      ),
      "0"
    );

    assert.equal(
      result.rows.length,
      1
    );
  }
);

test(
  "forwards Authorization and FABi app token",
  async () => {
    let headers;

    const client =
      factory({
        requestFn:
          async input => {
            headers =
              input.headers;

            return {
              status:
                200,

              body: {
                data: []
              }
            };
          }
      });

    await client
      .getSaleChangeLog(
        QUERY
      );

    assert.equal(
      headers.Authorization,
      "Bearer test"
    );

    assert.equal(
      headers.access_token,
      "app-test"
    );

    assert.equal(
      headers.fabi_type,
      "pos-cms"
    );
  }
);

test(
  "missing Authorization fails before transport",
  async () => {
    let calls = 0;

    const client =
      factory({
        auth:
          "",

        requestFn:
          async () => {
            calls++;
          }
      });

    await assert.rejects(
      client.getSaleChangeLog(
        QUERY
      ),
      /C04_AUTH_REQUIRED/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "missing FABi app token fails before transport",
  async () => {
    let calls = 0;

    const client =
      factory({
        access:
          "",

        requestFn:
          async () => {
            calls++;
          }
      });

    await assert.rejects(
      client.getSaleChangeLog(
        QUERY
      ),
      /C04_APP_ACCESS_REQUIRED/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "401 and 403 fail closed as auth required",
  async () => {
    for (
      const status
      of [
        401,
        403
      ]
    ) {
      const client =
        factory({
          requestFn:
            async () => ({
              status,
              body: {}
            })
        });

      await assert.rejects(
        client.getSaleChangeLog(
          QUERY
        ),
        /C04_AUTH_REQUIRED/
      );
    }
  }
);

test(
  "429 is rate limited",
  async () => {
    const client =
      factory({
        requestFn:
          async () => ({
            status:
              429,
            body: {}
          })
      });

    await assert.rejects(
      client.getSaleChangeLog(
        QUERY
      ),
      /C04_RATE_LIMITED/
    );
  }
);

test(
  "5xx is upstream failure",
  async () => {
    const client =
      factory({
        requestFn:
          async () => ({
            status:
              500,
            body: {}
          })
      });

    await assert.rejects(
      client.getSaleChangeLog(
        QUERY
      ),
      /C04_UPSTREAM_ERROR/
    );
  }
);

test(
  "invalid response schema fails closed",
  async () => {
    const client =
      factory({
        requestFn:
          async () => ({
            status:
              200,
            body: {
              data:
                null
            }
          })
      });

    await assert.rejects(
      client.getSaleChangeLog(
        QUERY
      ),
      /C04_SCHEMA_INVALID/
    );
  }
);

test(
  "transport errors are sanitized",
  async () => {
    const client =
      factory({
        requestFn:
          async () => {
            throw new Error(
              "Bearer super-secret"
            );
          }
      });

    await assert.rejects(
      client.getSaleChangeLog(
        QUERY
      ),
      error => {
        assert.equal(
          error.message,
          "C04_TRANSPORT_ERROR"
        );

        assert.doesNotMatch(
          error.message,
          /secret/
        );

        return true;
      }
    );
  }
);

test(
  "invalid time window fails before transport",
  async () => {
    let calls = 0;

    const client =
      factory({
        requestFn:
          async () => {
            calls++;
          }
      });

    await assert.rejects(
      client.getSaleChangeLog({
        ...QUERY,
        start_date:
          3000,
        end_date:
          2000
      }),
      /C04_WINDOW_REVERSED/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "request deadline aborts transport and sanitizes timeout",
  async () => {
    let aborted = false;

    const client =
      createFabiC04HttpClientV1({
        authProvider:
          async () => "Bearer test",
        appAccessTokenProvider:
          async () => "app-test",
        requestTimeoutMs: 1_000,
        requestFn:
          async ({signal}) =>
            new Promise((resolve, reject) => {
              signal.addEventListener(
                "abort",
                () => {
                  aborted = true;
                  reject(new Error("request aborted"));
                },
                {once: true}
              );
            })
      });

    await assert.rejects(
      client.getSaleChangeLog(QUERY),
      /C04_REQUEST_TIMEOUT/
    );

    assert.equal(aborted, true);
  }
);
