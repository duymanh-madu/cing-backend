"use strict";

function bridgeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function requiredString(
  value,
  code
) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw bridgeError(code);
  }

  return value.trim();
}

function optionalString(
  value,
  code
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (typeof value !== "string") {
    throw bridgeError(code);
  }

  const out = value.trim();

  return out || null;
}

function finiteNumber(
  value,
  code
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw bridgeError(code);
  }

  return number;
}

function validateScope(scope) {
  if (!isPlainObject(scope)) {
    throw bridgeError(
      "C03_FINAL_BRIDGE_SCOPE_INVALID"
    );
  }

  return Object.freeze({
    companyUid:
      requiredString(
        scope.companyUid,
        "C03_FINAL_BRIDGE_COMPANY_REQUIRED"
      ),

    brandUid:
      requiredString(
        scope.brandUid,
        "C03_FINAL_BRIDGE_BRAND_REQUIRED"
      ),

    storeUid:
      requiredString(
        scope.storeUid,
        "C03_FINAL_BRIDGE_STORE_REQUIRED"
      )
  });
}

function validateWindow(window) {
  if (!isPlainObject(window)) {
    throw bridgeError(
      "C03_FINAL_BRIDGE_WINDOW_INVALID"
    );
  }

  const startDate =
    finiteNumber(
      window.startDate,
      "C03_FINAL_BRIDGE_START_INVALID"
    );

  const endDate =
    finiteNumber(
      window.endDate,
      "C03_FINAL_BRIDGE_END_INVALID"
    );

  if (endDate < startDate) {
    throw bridgeError(
      "C03_FINAL_BRIDGE_WINDOW_REVERSED"
    );
  }

  return Object.freeze({
    startDate,
    endDate
  });
}

function exactTranNo(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const raw =
    String(value).trim();

  if (!raw) {
    return null;
  }

  return raw
    .split(" ")[0];
}

function createFabiC03FinalFetchBridgeV1({
  httpClient,
  scopeProvider,
  windowProvider
} = {}) {
  if (
    !httpClient ||
    typeof httpClient.getSaleDetail !==
      "function"
  ) {
    throw bridgeError(
      "C03_FINAL_BRIDGE_HTTP_CLIENT_REQUIRED"
    );
  }

  if (
    typeof scopeProvider !==
    "function"
  ) {
    throw bridgeError(
      "C03_FINAL_BRIDGE_SCOPE_PROVIDER_REQUIRED"
    );
  }

  if (
    typeof windowProvider !==
    "function"
  ) {
    throw bridgeError(
      "C03_FINAL_BRIDGE_WINDOW_PROVIDER_REQUIRED"
    );
  }

  async function fetchFinalInvoice({
    tran_id,
    tran_no,
    first_event_created_at,
    last_event_created_at
  } = {}) {
    const tranId =
      requiredString(
        tran_id,
        "C03_FINAL_BRIDGE_TRAN_ID_REQUIRED"
      );

    const tranNo =
      optionalString(
        tran_no,
        "C03_FINAL_BRIDGE_TRAN_NO_INVALID"
      );

    const firstEvent =
      finiteNumber(
        first_event_created_at,
        "C03_FINAL_BRIDGE_FIRST_EVENT_INVALID"
      );

    const lastEvent =
      finiteNumber(
        last_event_created_at,
        "C03_FINAL_BRIDGE_LAST_EVENT_INVALID"
      );

    if (lastEvent < firstEvent) {
      throw bridgeError(
        "C03_FINAL_BRIDGE_EVENT_WINDOW_REVERSED"
      );
    }

    /*
     * Scope and date attribution remain trusted,
     * injected boundaries.
     *
     * This bridge does NOT guess timezone,
     * business day or branch identity.
     */
    const scope =
      validateScope(
        await scopeProvider({
          tran_id:
            tranId
        })
      );

    const window =
      validateWindow(
        await windowProvider({
          tran_id:
            tranId,

          tran_no:
            tranNo,

          first_event_created_at:
            firstEvent,

          last_event_created_at:
            lastEvent
        })
      );

    /*
     * C03's search contract accepts a string.
     * Prefer human POS transaction number when
     * available; fall back to durable tran_id.
     */
    const search =
      tranNo || tranId;

    const detail =
      await httpClient
        .getSaleDetail({
          companyUid:
            scope.companyUid,

          brandUid:
            scope.brandUid,

          storeUid:
            scope.storeUid,

          startDate:
            window.startDate,

          endDate:
            window.endDate,

          search,

          page:
            1,

          resultsPerPage:
            200,

          sort:
            "dsc",

          storeOpenAt:
            0
        });

    if (
      !isPlainObject(detail) ||
      detail.source !==
        "fabi_c03_sale_by_date_csv" ||
      detail.expanded !== true ||
      !Array.isArray(
        detail.data
      )
    ) {
      throw bridgeError(
        "C03_FINAL_BRIDGE_DETAIL_INVALID"
      );
    }

    /*
     * Search result is discovery only.
     * Exact durable transaction identity decides
     * which C03 invoice is eligible.
     */
    const exact =
      detail.data.filter(
        invoice => {
          if (!isPlainObject(invoice)) {
            return false;
          }

          if (
            String(
              invoice.tran_id || ""
            ).trim() !==
            tranId
          ) {
            return false;
          }

          if (tranNo !== null) {
            const candidateTranNo =
              exactTranNo(
                invoice.tran_no
              );

            if (
              candidateTranNo !==
              tranNo
            ) {
              return false;
            }
          }

          return true;
        }
      );

    if (exact.length === 0) {
      return Object.freeze({
        status:
          "not_found",

        source:
          "fabi_c03_sale_by_date_csv",

        search_by:
          tranNo
            ? "tran_no"
            : "tran_id",

        track_id:
          typeof detail.track_id ===
            "string"
            ? detail.track_id
            : null
      });
    }

    /*
     * Do NOT silently pick one from multiple.
     * 63D owns ambiguity fail-closed logic.
     */
    return Object.freeze({
      status:
        "found",

      source:
        "fabi_c03_sale_by_date_csv",

      search_by:
        tranNo
          ? "tran_no"
          : "tran_id",

      track_id:
        typeof detail.track_id ===
          "string"
          ? detail.track_id
          : null,

      invoices:
        Object.freeze(
          exact.slice()
        )
    });
  }

  return Object.freeze({
    fetchFinalInvoice
  });
}

module.exports = {
  createFabiC03FinalFetchBridgeV1
};
