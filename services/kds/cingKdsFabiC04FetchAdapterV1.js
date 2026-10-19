"use strict";

const CANDIDATE_LOG_TYPES =
  Object.freeze([
    "SALE_CHANGE",
    "SALE_MERGE_ORDER"
  ]);

const CANDIDATE_SET =
  new Set(
    CANDIDATE_LOG_TYPES
  );

function adapterError(
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
    throw adapterError(code);
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
    throw adapterError(code);
  }

  return number;
}

function validateScope(
  scope
) {
  if (
    !scope ||
    typeof scope !== "object"
  ) {
    throw adapterError(
      "C04_FETCH_SCOPE_INVALID"
    );
  }

  return Object.freeze({
    company_uid:
      requiredString(
        scope.company_uid,
        "C04_FETCH_COMPANY_REQUIRED"
      ),

    brand_uid:
      requiredString(
        scope.brand_uid,
        "C04_FETCH_BRAND_REQUIRED"
      ),

    store_uid:
      requiredString(
        scope.store_uid,
        "C04_FETCH_STORE_REQUIRED"
      )
  });
}

function validateWindow(
  window
) {
  if (
    !window ||
    typeof window !== "object"
  ) {
    throw adapterError(
      "C04_FETCH_WINDOW_INVALID"
    );
  }

  const start =
    finiteNumber(
      window.start_date,
      "C04_FETCH_START_INVALID"
    );

  const end =
    finiteNumber(
      window.end_date,
      "C04_FETCH_END_INVALID"
    );

  if (
    end < start
  ) {
    throw adapterError(
      "C04_FETCH_WINDOW_REVERSED"
    );
  }

  return Object.freeze({
    start_date:
      start,

    end_date:
      end,

    /*
     * This is scheduling metadata only.
     * It must NEVER be interpreted by this adapter
     * as source completeness/correctness authority.
     */
    next_cursor:
      window.next_cursor ??
      null
  });
}

function createFabiC04FetchAdapterV1({
  httpClient,
  scopeProvider,
  windowProvider,
  beforeExternalOperation =
    async () => {},
  maxPages = 100
} = {}) {
  if (
    !httpClient ||
    typeof httpClient
      .getSaleChangeLog !==
      "function"
  ) {
    throw adapterError(
      "C04_FETCH_HTTP_CLIENT_REQUIRED"
    );
  }

  if (
    typeof beforeExternalOperation !==
      "function"
  ) {
    throw adapterError(
      "C04_FETCH_LEASE_GUARD_REQUIRED"
    );
  }

  if (
    typeof scopeProvider !==
      "function"
  ) {
    throw adapterError(
      "C04_FETCH_SCOPE_PROVIDER_REQUIRED"
    );
  }

  if (
    typeof windowProvider !==
      "function"
  ) {
    throw adapterError(
      "C04_FETCH_WINDOW_PROVIDER_REQUIRED"
    );
  }

  const pageLimit =
    Number(
      maxPages
    );

  if (
    !Number.isSafeInteger(
      pageLimit
    ) ||
    pageLimit < 1 ||
    pageLimit > 1000
  ) {
    throw adapterError(
      "C04_FETCH_MAX_PAGES_INVALID"
    );
  }

  async function fetchEvents({
    cursor = null
  } = {}) {
    const scope =
      validateScope(
        await scopeProvider()
      );

    const window =
      validateWindow(
        await windowProvider({
          cursor
        })
      );

    const events = [];

    let exhausted =
      false;

    for (
      let page = 1;
      page <= pageLimit;
      page++
    ) {
      await beforeExternalOperation();

      const result =
        await httpClient
          .getSaleChangeLog({
            ...scope,

            start_date:
              window.start_date,

            end_date:
              window.end_date,

            page
          });

      if (
        !result ||
        !Array.isArray(
          result.rows
        ) ||
        result.page !==
          page
      ) {
        throw adapterError(
          "C04_FETCH_PAGE_RESULT_INVALID"
        );
      }

      if (
        result.rows.length === 0
      ) {
        exhausted =
          true;

        break;
      }

      for (
        const row
        of result.rows
      ) {
        if (
          row &&
          typeof row ===
            "object" &&
          CANDIDATE_SET.has(
            row.log_type
          )
        ) {
          /*
           * Preserve the exact upstream row.
           * No SALE_MERGE_ORDER -> SALE_CHANGE rewrite.
           * The production normalizer owns semantics.
           */
          events.push(
            row
          );
        }
      }
    }

    if (!exhausted) {
      /*
       * We cannot claim source completeness if the
       * configured page ceiling was reached.
       */
      throw adapterError(
        "C04_FETCH_PAGE_LIMIT_REACHED"
      );
    }

    return Object.freeze({
      events:
        Object.freeze([
          ...events
        ]),

      next_cursor:
        window.next_cursor
    });
  }

  return Object.freeze({
    fetchEvents
  });
}

module.exports = {
  CANDIDATE_LOG_TYPES,
  createFabiC04FetchAdapterV1
};
