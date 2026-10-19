"use strict";

const {
  normalizeC03Snapshot
} = require("./cingKdsFabiC03SnapshotV1");

function identity(invoice) {
  return JSON.stringify([
    invoice.pos_parent,
    invoice.tran_id
  ]);
}

function compareC03Snapshots(previousRaw, currentRaw) {
  const previous = normalizeC03Snapshot(previousRaw);
  const current = normalizeC03Snapshot(currentRaw);

  const oldInvoices = new Map(
    previous.invoices.map(invoice => [
      identity(invoice), invoice
    ])
  );

  const newInvoices = new Map(
    current.invoices.map(invoice => [
      identity(invoice), invoice
    ])
  );

  const changes = [];

  function record(type, invoiceKey, lineId = null) {
    changes.push({
      type,
      invoice_key: invoiceKey,
      line_id: lineId,
      requires_review: true,
      automatic_mutation_allowed: false
    });
  }

  for (const [key, currentInvoice] of newInvoices) {
    const previousInvoice = oldInvoices.get(key);

    if (!previousInvoice) {
      record("invoice_first_observed", key);
      continue;
    }

    const oldLines = new Map(
      previousInvoice.lines.map(line => [
        line.line_id, line
      ])
    );

    const newLines = new Map(
      currentInvoice.lines.map(line => [
        line.line_id, line
      ])
    );

    for (const [id, newLine] of newLines) {
      const oldLine = oldLines.get(id);

      if (!oldLine) {
        record("line_first_observed", key, id);
        continue;
      }

      if (JSON.stringify(oldLine) !==
          JSON.stringify(newLine)) {
        record("line_changed_review", key, id);
      }
    }

    for (const id of oldLines.keys()) {
      if (!newLines.has(id)) {
        record("line_missing_review", key, id);
      }
    }

    // Changes in payment, timestamps and invoice metadata
    // cannot be silently interpreted as production events.
    if (
      previousInvoice.fingerprint !==
      currentInvoice.fingerprint &&
      !changes.some(c => c.invoice_key === key)
    ) {
      record("invoice_metadata_changed_review", key);
    }
  }

  for (const key of oldInvoices.keys()) {
    if (!newInvoices.has(key)) {
      record("invoice_missing_review", key);
    }
  }

  return {
    schema: "cing_fabi_c03_delta_v1",
    operational_status: "dormant",
    source_completeness_verified: false,
    source_freshness_verified: false,
    is_authoritative_event_journal: false,
    automatic_mutation_allowed: false,
    payment_authority_verified: false,
    verdict: "not_verified",
    previous_invoice_count: previous.totals.invoices,
    current_invoice_count: current.totals.invoices,
    change_count: changes.length,
    changes
  };
}

module.exports = {
  compareC03Snapshots
};
