"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFabiC03HttpClientV1
} = require("../cingKdsFabiC03HttpClientV1");

const BASE = {
  companyUid: "COMPANY-1",
  brandUid: "BRAND-1",
  storeUid: "STORE-1",
  startDate: 1791910800000,
  endDate: 1791997199000
};

function makeClient({
  auth = "AUTH_VALUE_DO_NOT_LOG",
  appAccess = "APP_ACCESS_VALUE",
  responder
} = {}) {
  const calls = [];

  const client = createFabiC03HttpClientV1({
    authProvider: async () => auth,
    appAccessTokenProvider:
      async () => appAccess,
    requestFn: async request => {
      calls.push(request);

      if (responder) {
        return responder(request);
      }

      return {
        status: 200,
        json: {
          data: [],
          track_id: "TRACK-1"
        }
      };
    }
  });

  return { client, calls };
}

test("Construction performs no network request", () => {
  let calls = 0;

  createFabiC03HttpClientV1({
    authProvider: async () => "AUTH",
    appAccessTokenProvider:
      async () => "APP_ACCESS",
    requestFn: async () => {
      calls++;
      return { status: 200, json: {} };
    }
  });

  assert.equal(calls, 0);
});

test("List contract uses exact FABi C03 endpoint", async () => {
  const { client, calls } = makeClient();

  await client.listSales(BASE);

  assert.equal(calls.length, 1);

  const request = calls[0];
  const url = new URL(request.url);

  assert.equal(request.method, "GET");
  assert.equal(url.origin, "https://posapi.ipos.vn");
  assert.equal(
    url.pathname,
    "/api/reports_v1/v3/pos-cms/report/sale-by-date"
  );
  assert.equal(url.searchParams.get("page"), "1");
  assert.equal(
    url.searchParams.get("results_per_page"),
    "200"
  );
  assert.equal(url.searchParams.get("csv"), null);
});

test("Expanded detail uses csv=1 and search", async () => {
  const { client, calls } = makeClient({
    responder: async () => ({
      status: 200,
      json: {
        data: [{
          tran_id: "TX-1",
          sale_detail: []
        }]
      }
    })
  });

  const result = await client.getSaleDetail({
    ...BASE,
    search: "QJGCW"
  });

  const url = new URL(calls[0].url);

  assert.equal(url.searchParams.get("csv"), "1");
  assert.equal(
    url.searchParams.get("search"),
    "QJGCW"
  );
  assert.equal(result.expanded, true);
});

test("Summary uses sale-summary days endpoint", async () => {
  const { client, calls } = makeClient({
    responder: async () => ({
      status: 200,
      json: {
        data: {
          total_sales: 35,
          revenue_net: 3782208
        }
      }
    })
  });

  const result = await client.getSaleSummary({
    companyUid: BASE.companyUid,
    storeUid: BASE.storeUid,
    startDate: BASE.startDate,
    endDate: BASE.endDate
  });

  const url = new URL(calls[0].url);

  assert.equal(
    url.pathname,
    "/api/v3/reports/sale-summary/days"
  );
  assert.equal(
    url.searchParams.get("list_store_uid"),
    BASE.storeUid
  );
  assert.equal(result.total_sales, 35);
});

test("Missing authorization fails before transport", async () => {
  const { client, calls } = makeClient({
    auth: ""
  });

  await assert.rejects(
    client.listSales(BASE),
    error => error.code === "C03_AUTH_REQUIRED"
  );

  assert.equal(calls.length, 0);
});

test("Authorization is forwarded exactly once", async () => {
  const { client, calls } = makeClient({
    auth: "OPAQUE_AUTH_VALUE"
  });

  await client.listSales(BASE);

  assert.equal(
    calls[0].headers.Authorization,
    "OPAQUE_AUTH_VALUE"
  );
});

test("FABi app access token is forwarded", async () => {
  const { client, calls } = makeClient({
    appAccess: "OPAQUE_APP_ACCESS"
  });

  await client.listSales(BASE);

  assert.equal(
    calls[0].headers.access_token,
    "OPAQUE_APP_ACCESS"
  );
});

test("Missing FABi app access fails before transport",
async () => {
  const { client, calls } = makeClient({
    appAccess: ""
  });

  await assert.rejects(
    client.listSales(BASE),
    error =>
      error.code === "C03_APP_ACCESS_REQUIRED"
  );

  assert.equal(calls.length, 0);
});

test("401 fails closed as AUTH_REQUIRED", async () => {
  const { client } = makeClient({
    responder: async () => ({
      status: 401,
      json: { message: "secret upstream text" }
    })
  });

  await assert.rejects(
    client.listSales(BASE),
    error => error.code === "C03_AUTH_REQUIRED"
  );
});

test("403 fails closed as AUTH_REQUIRED", async () => {
  const { client } = makeClient({
    responder: async () => ({
      status: 403,
      json: {}
    })
  });

  await assert.rejects(
    client.listSales(BASE),
    error => error.code === "C03_AUTH_REQUIRED"
  );
});

test("429 is classified as rate limited", async () => {
  const { client } = makeClient({
    responder: async () => ({
      status: 429,
      json: {}
    })
  });

  await assert.rejects(
    client.listSales(BASE),
    error => error.code === "C03_RATE_LIMITED"
  );
});

test("5xx is classified as upstream error", async () => {
  const { client } = makeClient({
    responder: async () => ({
      status: 503,
      json: {}
    })
  });

  await assert.rejects(
    client.listSales(BASE),
    error => error.code === "C03_UPSTREAM_ERROR"
  );
});

test("Invalid list schema fails closed", async () => {
  const { client } = makeClient({
    responder: async () => ({
      status: 200,
      json: { data: {} }
    })
  });

  await assert.rejects(
    client.listSales(BASE),
    error => error.code === "C03_SCHEMA_INVALID"
  );
});

test("Expanded detail requires sale_detail array", async () => {
  const { client } = makeClient({
    responder: async () => ({
      status: 200,
      json: {
        data: [{
          tran_id: "TX-1"
        }]
      }
    })
  });

  await assert.rejects(
    client.getSaleDetail({
      ...BASE,
      search: "TX-1"
    }),
    error => error.code === "C03_SCHEMA_INVALID"
  );
});

test("Summary requires nonnegative integer total_sales",
async () => {
  const { client } = makeClient({
    responder: async () => ({
      status: 200,
      json: {
        data: {
          total_sales: "35"
        }
      }
    })
  });

  await assert.rejects(
    client.getSaleSummary({
      companyUid: BASE.companyUid,
      storeUid: BASE.storeUid,
      startDate: BASE.startDate,
      endDate: BASE.endDate
    }),
    error => error.code === "C03_SCHEMA_INVALID"
  );
});

test("results_per_page above FABi limit is rejected",
async () => {
  const { client, calls } = makeClient();

  await assert.rejects(
    client.listSales({
      ...BASE,
      resultsPerPage: 1001
    }),
    error => error.code === "C03_QUERY_INVALID"
  );

  assert.equal(calls.length, 0);
});

test("Invalid page is rejected before network", async () => {
  const { client, calls } = makeClient();

  await assert.rejects(
    client.listSales({
      ...BASE,
      page: 0
    }),
    error => error.code === "C03_QUERY_INVALID"
  );

  assert.equal(calls.length, 0);
});

test("Invalid date window is rejected before network",
async () => {
  const { client, calls } = makeClient();

  await assert.rejects(
    client.listSales({
      ...BASE,
      startDate: 200,
      endDate: 100
    }),
    error => error.code === "C03_QUERY_INVALID"
  );

  assert.equal(calls.length, 0);
});

test("Transport failures never leak authorization",
async () => {
  const secret = "DO_NOT_EXPOSE_THIS_AUTH_VALUE";

  const client = createFabiC03HttpClientV1({
    authProvider: async () => secret,
    appAccessTokenProvider:
      async () => "APP_ACCESS",
    requestFn: async () => {
      throw new Error(
        "network failed with " + secret
      );
    }
  });

  await assert.rejects(
    client.listSales(BASE),
    error => {
      assert.equal(
        error.code,
        "C03_TRANSPORT_ERROR"
      );
      assert.equal(
        error.message.includes(secret),
        false
      );
      return true;
    }
  );
});

test("Search value is URL encoded, not concatenated raw",
async () => {
  const { client, calls } = makeClient({
    responder: async () => ({
      status: 200,
      json: {
        data: [{
          tran_id: "TX-1",
          sale_detail: []
        }]
      }
    })
  });

  await client.getSaleDetail({
    ...BASE,
    search: "ABC&csv=0"
  });

  const url = new URL(calls[0].url);

  assert.equal(
    url.searchParams.get("search"),
    "ABC&csv=0"
  );
  assert.equal(
    url.searchParams.get("csv"),
    "1"
  );
});

test("Request deadline aborts C03 transport", async () => {
  let aborted = false;

  const client = createFabiC03HttpClientV1({
    authProvider: async () => "AUTH",
    appAccessTokenProvider:
      async () => "APP_ACCESS",
    requestTimeoutMs: 1_000,
    requestFn: async ({signal}) =>
      new Promise((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("aborted"));
          },
          {once: true}
        );
      })
  });

  await assert.rejects(
    client.getSaleDetail({
      ...BASE,
      search: "TRAN-OLD"
    }),
    error => error.code === "C03_REQUEST_TIMEOUT"
  );

  assert.equal(aborted, true);
});
