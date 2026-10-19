"use strict";

const {
  normalizeC03Snapshot
} = require("./cingKdsFabiC03SnapshotV1");

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredFunction(value, name) {
  if (typeof value !== "function") {
    throw fail(
      "C03_POLL_CONFIG_INVALID",
      `${name} required`
    );
  }
  return value;
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw fail(
      "C03_POLL_DATA_INVALID",
      `${name} required`
    );
  }
  return value.trim();
}

function createC03PollCoordinatorV1(options = {}) {
  const api = options.api;

  if (
    !api ||
    typeof api.listSales !== "function" ||
    typeof api.getSaleDetail !== "function"
  ) {
    throw fail(
      "C03_POLL_CONFIG_INVALID",
      "api adapter required"
    );
  }

  const hasProcessed =
    requiredFunction(
      options.hasProcessed,
      "hasProcessed"
    );

  const persist =
    requiredFunction(
      options.persist,
      "persist"
    );

  const now =
    typeof options.now === "function"
      ? options.now
      : () => Date.now();

  let closed = false;
  let running = false;

  async function poll(query) {
    if (closed) {
      throw fail(
        "C03_POLL_CLOSED",
        "coordinator closed"
      );
    }

    if (running) {
      throw fail(
        "C03_POLL_BUSY",
        "poll already running"
      );
    }

    running = true;

    try {
      const listed = await api.listSales(query);

      if (
        !listed ||
        !Array.isArray(listed.data)
      ) {
        throw fail(
          "C03_POLL_DATA_INVALID",
          "list response invalid"
        );
      }

      const seenInCurrentList = new Set();
      const validatedRows = [];

      // Validate the complete source list before any
      // detail fetch, persistence or other side effect.
      for (const row of listed.data) {
        if (
          !row ||
          typeof row !== "object"
        ) {
          throw fail(
            "C03_POLL_DATA_INVALID",
            "invalid list row"
          );
        }

        const tranId =
          requiredString(
            row.tran_id,
            "tran_id"
          );

        if (seenInCurrentList.has(tranId)) {
          throw fail(
            "C03_POLL_DUPLICATE_LIST_ID",
            "duplicate tran_id in list"
          );
        }

        seenInCurrentList.add(tranId);
        validatedRows.push({
          row,
          tranId
        });
      }

      const accepted = [];
      const skipped = [];

      for (const {
        row,
        tranId
      } of validatedRows) {
        if (await hasProcessed(tranId)) {
          skipped.push({
            tran_id: tranId,
            reason: "already_processed"
          });
          continue;
        }

        const search =
          typeof row.tran_no === "string" &&
          row.tran_no.trim()
            ? row.tran_no.trim()
            : tranId;

        const detail = await api.getSaleDetail({
          ...query,
          search
        });

        if (
          !detail ||
          !Array.isArray(detail.data)
        ) {
          throw fail(
            "C03_POLL_DATA_INVALID",
            "detail response invalid"
          );
        }

        const exactMatches =
          detail.data.filter(
            sale =>
              sale &&
              sale.tran_id === tranId
          );

        if (exactMatches.length !== 1) {
          throw fail(
            "C03_POLL_DETAIL_MISMATCH",
            "detail must contain exactly one matching transaction"
          );
        }

        const normalized =
          normalizeC03Snapshot([
            exactMatches[0]
          ]);

        if (
          normalized.invoices.length !== 1 ||
          normalized.invoices[0].tran_id !== tranId
        ) {
          throw fail(
            "C03_POLL_NORMALIZE_MISMATCH",
            "normalized transaction mismatch"
          );
        }

        const envelope = {
          source: "fabi_c03_poll_v1",
          observed_at_ms: now(),
          list_track_id:
            typeof listed.track_id === "string"
              ? listed.track_id
              : null,
          detail_track_id:
            typeof detail.track_id === "string"
              ? detail.track_id
              : null,
          tran_id: tranId,
          fingerprint:
            normalized.invoices[0].fingerprint,
          normalized
        };

        await persist(envelope);

        accepted.push({
          tran_id: tranId,
          fingerprint:
            envelope.fingerprint
        });
      }

      return {
        schema: "cing_fabi_c03_poll_result_v1",
        operational_status: "dormant",
        listed_count: listed.data.length,
        accepted_count: accepted.length,
        skipped_count: skipped.length,
        accepted,
        skipped
      };
    } finally {
      running = false;
    }
  }

  function close() {
    closed = true;
  }

  function status() {
    return {
      closed,
      running
    };
  }

  return Object.freeze({
    poll,
    close,
    status
  });
}

module.exports = {
  createC03PollCoordinatorV1
};
