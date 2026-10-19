"use strict";

/*
 * FABi C04 sale-change-log read-only transport.
 *
 * DORMANT.
 *
 * No auth material is stored here.
 * Authorization + FABi app access token must be
 * supplied by injected providers at request time.
 */

const ORIGIN =
  "https://posapi.ipos.vn";

const PATH =
  "/api/v3/pos-cms/sale-change-log";

function clientError(
  code
) {
  const error =
    new Error(code);

  error.code =
    code;

  return error;
}

function requiredString(
  value,
  code
) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw clientError(code);
  }

  return value.trim();
}

function finiteNumber(
  value,
  code
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    throw clientError(code);
  }

  return number;
}

function positiveInteger(
  value,
  code
) {
  const number =
    Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 1
  ) {
    throw clientError(code);
  }

  return number;
}

function requestTimeout(
  value
) {
  const timeout =
    positiveInteger(
      value,
      "C04_REQUEST_TIMEOUT_INVALID"
    );

  if (timeout < 1_000 || timeout > 30_000) {
    throw clientError(
      "C04_REQUEST_TIMEOUT_INVALID"
    );
  }

  return timeout;
}

function validateResponse(
  response
) {
  if (
    !response ||
    typeof response !== "object"
  ) {
    throw clientError(
      "C04_TRANSPORT_INVALID"
    );
  }

  const status =
    Number(
      response.status
    );

  if (
    status === 401 ||
    status === 403
  ) {
    throw clientError(
      "C04_AUTH_REQUIRED"
    );
  }

  if (
    status === 429
  ) {
    throw clientError(
      "C04_RATE_LIMITED"
    );
  }

  if (
    !Number.isSafeInteger(status) ||
    status < 200 ||
    status >= 300
  ) {
    throw clientError(
      "C04_UPSTREAM_ERROR"
    );
  }

  const body =
    response.body;

  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray(
      body.data
    )
  ) {
    throw clientError(
      "C04_SCHEMA_INVALID"
    );
  }

  return body.data;
}

function createFabiC04HttpClientV1({
  authProvider,
  appAccessTokenProvider,
  requestFn,
  requestTimeoutMs = 10_000
} = {}) {
  if (
    typeof authProvider !==
      "function"
  ) {
    throw clientError(
      "C04_AUTH_PROVIDER_REQUIRED"
    );
  }

  const timeoutMs =
    requestTimeout(
      requestTimeoutMs
    );

  async function requestWithDeadline(
    request
  ) {
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
        timeoutMs
      );

    try {
      return await requestFn({
        ...request,
        signal:
          controller.signal
      });
    } catch (_) {
      throw clientError(
        timedOut
          ? "C04_REQUEST_TIMEOUT"
          : "C04_TRANSPORT_ERROR"
      );
    } finally {
      clearTimeout(timer);
    }
  }

  if (
    typeof appAccessTokenProvider !==
      "function"
  ) {
    throw clientError(
      "C04_APP_ACCESS_PROVIDER_REQUIRED"
    );
  }

  if (
    typeof requestFn !==
      "function"
  ) {
    throw clientError(
      "C04_REQUEST_FN_REQUIRED"
    );
  }

  async function getSaleChangeLog({
    company_uid,
    brand_uid,
    store_uid,
    start_date,
    end_date,
    page = 1
  } = {}) {
    const companyUid =
      requiredString(
        company_uid,
        "C04_COMPANY_REQUIRED"
      );

    const brandUid =
      requiredString(
        brand_uid,
        "C04_BRAND_REQUIRED"
      );

    const storeUid =
      requiredString(
        store_uid,
        "C04_STORE_REQUIRED"
      );

    const startDate =
      finiteNumber(
        start_date,
        "C04_START_DATE_INVALID"
      );

    const endDate =
      finiteNumber(
        end_date,
        "C04_END_DATE_INVALID"
      );

    if (
      endDate < startDate
    ) {
      throw clientError(
        "C04_WINDOW_REVERSED"
      );
    }

    const pageNumber =
      positiveInteger(
        page,
        "C04_PAGE_INVALID"
      );

    const authorization =
      requiredString(
        await authProvider(),
        "C04_AUTH_REQUIRED"
      );

    const accessToken =
      requiredString(
        await appAccessTokenProvider(),
        "C04_APP_ACCESS_REQUIRED"
      );

    const url =
      new URL(
        PATH,
        ORIGIN
      );

    url.searchParams.set(
      "company_uid",
      companyUid
    );

    url.searchParams.set(
      "brand_uid",
      brandUid
    );

    url.searchParams.set(
      "store_uid",
      storeUid
    );

    url.searchParams.set(
      "start_date",
      String(startDate)
    );

    url.searchParams.set(
      "end_date",
      String(endDate)
    );

    url.searchParams.set(
      "page",
      String(pageNumber)
    );

    url.searchParams.set(
      "store_open_at",
      "0"
    );

    let response;

    response =
      await requestWithDeadline({
        method:
          "GET",

        url:
          url.toString(),

        headers: {
          Accept:
            "application/json, text/plain, */*",

          Authorization:
            authorization,

          access_token:
            accessToken,

          fabi_type:
            "pos-cms",

          "accept-language":
            "vi"
        }
      });

    return Object.freeze({
      rows:
        Object.freeze([
          ...validateResponse(
            response
          )
        ]),

      page:
        pageNumber
    });
  }

  return Object.freeze({
    getSaleChangeLog
  });
}

module.exports = {
  ORIGIN,
  PATH,
  createFabiC04HttpClientV1
};
