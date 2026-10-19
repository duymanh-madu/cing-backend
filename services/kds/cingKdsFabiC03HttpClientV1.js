"use strict";

/**
 * FABi C03 read-only transport contract.
 *
 * DORMANT.
 *
 * This module deliberately does NOT:
 * - log in to FABi
 * - store credentials
 * - refresh/rotate credentials
 * - write to FABi
 * - mutate Production DB
 * - decide payment authority
 * - certify source completeness
 * - split grouped sale lines into per-cup modifier truth
 */

const ORIGIN = "https://posapi.ipos.vn";

const PATHS = Object.freeze({
  saleByDate:
    "/api/reports_v1/v3/pos-cms/report/sale-by-date",
  saleSummary:
    "/api/v3/reports/sale-summary/days"
});

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw fail(
      "C03_CONFIG_INVALID",
      `invalid ${field}`
    );
  }
  return value.trim();
}

function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw fail(
      "C03_QUERY_INVALID",
      `invalid ${field}`
    );
  }
  return value;
}

function timestamp(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw fail(
      "C03_QUERY_INVALID",
      `invalid ${field}`
    );
  }
  return value;
}

function requestTimeout(value) {
  const timeout =
    positiveInteger(
      value,
      "requestTimeoutMs"
    );

  if (timeout < 1_000 || timeout > 30_000) {
    throw fail(
      "C03_CONFIG_INVALID",
      "invalid requestTimeoutMs"
    );
  }

  return timeout;
}

function validateWindow(startDate, endDate) {
  timestamp(startDate, "start_date");
  timestamp(endDate, "end_date");

  if (endDate < startDate) {
    throw fail(
      "C03_QUERY_INVALID",
      "end_date before start_date"
    );
  }
}

function pageSize(value) {
  const parsed = positiveInteger(
    value,
    "results_per_page"
  );

  if (parsed > 1000) {
    throw fail(
      "C03_QUERY_INVALID",
      "results_per_page exceeds FABi limit"
    );
  }

  return parsed;
}

function buildUrl(path, params) {
  if (
    typeof path !== "string" ||
    !path.startsWith("/")
  ) {
    throw fail(
      "C03_CONFIG_INVALID",
      "invalid path"
    );
  }

  const url = new URL(path, ORIGIN);

  for (const [key, value] of Object.entries(params)) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  if (url.origin !== ORIGIN) {
    throw fail(
      "C03_CONFIG_INVALID",
      "unexpected FABi origin"
    );
  }

  return url.toString();
}

function validateEnvelope(result) {
  if (
    !result ||
    typeof result !== "object" ||
    !Number.isSafeInteger(result.status)
  ) {
    throw fail(
      "C03_TRANSPORT_INVALID",
      "invalid transport response"
    );
  }

  return result;
}

function sanitizeStatusError(status) {
  if (status === 401 || status === 403) {
    return fail(
      "C03_AUTH_REQUIRED",
      "FABi authorization required"
    );
  }

  if (status === 429) {
    return fail(
      "C03_RATE_LIMITED",
      "FABi rate limited request"
    );
  }

  if (status < 200 || status >= 300) {
    return fail(
      "C03_UPSTREAM_ERROR",
      `FABi HTTP ${status}`
    );
  }

  return null;
}

function createFabiC03HttpClientV1(options = {}) {
  const authProvider = options.authProvider;
  const appAccessTokenProvider =
    options.appAccessTokenProvider;
  const requestFn = options.requestFn;
  const timezoneOffsetMs =
    options.timezoneOffsetMs ?? 25200000;
  const requestTimeoutMs =
    requestTimeout(
      options.requestTimeoutMs ?? 10_000
    );

  if (typeof authProvider !== "function") {
    throw fail(
      "C03_CONFIG_INVALID",
      "authProvider required"
    );
  }

  if (typeof appAccessTokenProvider !== "function") {
    throw fail(
      "C03_CONFIG_INVALID",
      "appAccessTokenProvider required"
    );
  }

  if (typeof requestFn !== "function") {
    throw fail(
      "C03_CONFIG_INVALID",
      "requestFn required"
    );
  }

  if (!Number.isSafeInteger(timezoneOffsetMs)) {
    throw fail(
      "C03_CONFIG_INVALID",
      "invalid timezoneOffsetMs"
    );
  }

  async function requestJson(url) {
    const authorization = await authProvider();
    const appAccessToken =
      await appAccessTokenProvider();

    if (
      typeof authorization !== "string" ||
      !authorization.trim()
    ) {
      throw fail(
        "C03_AUTH_REQUIRED",
        "FABi authorization required"
      );
    }

    if (
      typeof appAccessToken !== "string" ||
      !appAccessToken.trim()
    ) {
      throw fail(
        "C03_APP_ACCESS_REQUIRED",
        "FABi app access token required"
      );
    }

    const controller =
      new AbortController();

    let timedOut =
      false;

    const timer =
      setTimeout(
        () => {
          timedOut =
            true;

          controller.abort();
        },
        requestTimeoutMs
      );

    let response;

    try {
      response = await requestFn({
        method: "GET",
        url,
        headers: {
          Accept: "application/json, text/plain, */*",
          Authorization: authorization,
          access_token: appAccessToken,
          fabi_type: "pos-cms",
          "x-client-timezone":
            String(timezoneOffsetMs)
        },
        signal:
          controller.signal
      });
    } catch (_) {
      throw fail(
        timedOut
          ? "C03_REQUEST_TIMEOUT"
          : "C03_TRANSPORT_ERROR",
        timedOut
          ? "FABi request deadline exceeded"
          : "FABi request transport failure"
      );
    } finally {
      clearTimeout(timer);
    }

    validateEnvelope(response);

    const statusError =
      sanitizeStatusError(response.status);

    if (statusError) throw statusError;

    if (
      !Object.prototype.hasOwnProperty.call(
        response,
        "json"
      )
    ) {
      throw fail(
        "C03_TRANSPORT_INVALID",
        "missing JSON response"
      );
    }

    return response.json;
  }

  async function listSales({
    companyUid,
    brandUid,
    storeUid,
    startDate,
    endDate,
    page = 1,
    resultsPerPage = 200,
    sort = "dsc",
    storeOpenAt = 0,
    search
  }) {
    validateWindow(startDate, endDate);

    const url = buildUrl(
      PATHS.saleByDate,
      {
        company_uid:
          requiredString(companyUid, "company_uid"),
        brand_uid:
          requiredString(brandUid, "brand_uid"),
        store_uid:
          requiredString(storeUid, "store_uid"),
        start_date: startDate,
        end_date: endDate,
        search:
          typeof search === "string"
            ? search.trim()
            : undefined,
        sort:
          sort === "asc" ? "asc" : "dsc",
        store_open_at: storeOpenAt,
        page: positiveInteger(page, "page"),
        results_per_page:
          pageSize(resultsPerPage)
      }
    );

    const body = await requestJson(url);

    if (
      !body ||
      typeof body !== "object" ||
      !Array.isArray(body.data)
    ) {
      throw fail(
        "C03_SCHEMA_INVALID",
        "sale-by-date data must be array"
      );
    }

    return {
      source: "fabi_c03_sale_by_date",
      expanded: false,
      data: body.data,
      track_id:
        typeof body.track_id === "string"
          ? body.track_id
          : null
    };
  }

  async function getSaleDetail({
    companyUid,
    brandUid,
    storeUid,
    startDate,
    endDate,
    search,
    page = 1,
    resultsPerPage = 200,
    sort = "dsc",
    storeOpenAt = 0
  }) {
    validateWindow(startDate, endDate);

    const exactSearch =
      requiredString(search, "search");

    const url = buildUrl(
      PATHS.saleByDate,
      {
        company_uid:
          requiredString(companyUid, "company_uid"),
        brand_uid:
          requiredString(brandUid, "brand_uid"),
        store_uid:
          requiredString(storeUid, "store_uid"),
        start_date: startDate,
        end_date: endDate,
        search: exactSearch,
        sort:
          sort === "asc" ? "asc" : "dsc",
        store_open_at: storeOpenAt,
        csv: 1,
        page: positiveInteger(page, "page"),
        results_per_page:
          pageSize(resultsPerPage)
      }
    );

    const body = await requestJson(url);

    if (
      !body ||
      typeof body !== "object" ||
      !Array.isArray(body.data)
    ) {
      throw fail(
        "C03_SCHEMA_INVALID",
        "expanded sale data must be array"
      );
    }

    for (const sale of body.data) {
      if (
        !sale ||
        typeof sale !== "object" ||
        !Array.isArray(sale.sale_detail)
      ) {
        throw fail(
          "C03_SCHEMA_INVALID",
          "expanded sale missing sale_detail"
        );
      }
    }

    return {
      source: "fabi_c03_sale_by_date_csv",
      expanded: true,
      data: body.data,
      track_id:
        typeof body.track_id === "string"
          ? body.track_id
          : null
    };
  }

  async function getSaleSummary({
    companyUid,
    storeUid,
    startDate,
    endDate,
    storeOpenAt = 0
  }) {
    validateWindow(startDate, endDate);

    const url = buildUrl(
      PATHS.saleSummary,
      {
        list_store_uid:
          requiredString(storeUid, "store_uid"),
        company_uid:
          requiredString(companyUid, "company_uid"),
        start_date: startDate,
        end_date: endDate,
        store_open_at: storeOpenAt
      }
    );

    const body = await requestJson(url);

    const totalSales =
      body &&
      body.data &&
      body.data.total_sales;

    if (
      !Number.isSafeInteger(totalSales) ||
      totalSales < 0
    ) {
      throw fail(
        "C03_SCHEMA_INVALID",
        "summary total_sales invalid"
      );
    }

    return {
      source: "fabi_c03_sale_summary_days",
      total_sales: totalSales,
      data: body.data,
      track_id:
        typeof body.track_id === "string"
          ? body.track_id
          : null
    };
  }

  return Object.freeze({
    listSales,
    getSaleDetail,
    getSaleSummary
  });
}

module.exports = {
  createFabiC03HttpClientV1
};
