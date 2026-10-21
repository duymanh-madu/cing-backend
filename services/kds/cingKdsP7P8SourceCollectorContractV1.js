"use strict";

const crypto = require("node:crypto");

const {
  branchIdentity
} = require("./cingKdsBranchAccessPolicyV1");

function collectorError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredString(value, code) {
  if (typeof value !== "string" || !value.trim()) {
    throw collectorError(code);
  }
  return value.trim();
}

function positiveQuantity(value, code) {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw collectorError(code);
  }
  return quantity;
}

function exactBoolean(value, code) {
  if (value !== true && value !== false) {
    throw collectorError(code);
  }
  return value;
}

function stable(value) {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stable(value[key])])
    );
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

function normalizeModifiers(value, path) {
  if (!Array.isArray(value)) {
    throw collectorError(`${path}_MODIFIERS_REQUIRED`);
  }

  const normalized = value.map((modifier, index) => {
    if (!modifier || typeof modifier !== "object" || Array.isArray(modifier)) {
      throw collectorError(`${path}_MODIFIER_INVALID`);
    }
    return Object.freeze({
      modifier_id: requiredString(modifier.modifier_id, `${path}_MODIFIER_ID_INVALID`),
      quantity: positiveQuantity(modifier.quantity, `${path}_MODIFIER_QUANTITY_INVALID`)
    });
  });

  const identities = new Set();
  for (const modifier of normalized) {
    if (identities.has(modifier.modifier_id)) {
      throw collectorError(`${path}_MODIFIER_DUPLICATE`);
    }
    identities.add(modifier.modifier_id);
  }

  return Object.freeze([...normalized].sort((left, right) => left.modifier_id.localeCompare(right.modifier_id)));
}

function normalizeLine(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw collectorError(`${path}_LINE_INVALID`);
  }

  return Object.freeze({
    line_key: requiredString(value.line_key, `${path}_LINE_KEY_INVALID`),
    item_id: requiredString(value.item_id, `${path}_ITEM_ID_INVALID`),
    variant_id: requiredString(value.variant_id, `${path}_VARIANT_ID_INVALID`),
    quantity: positiveQuantity(value.quantity, `${path}_QUANTITY_INVALID`),
    modifiers: normalizeModifiers(value.modifiers, path)
  });
}

function normalizeInvoice(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw collectorError(`${path}_INVOICE_INVALID`);
  }
  if (!Array.isArray(value.lines)) {
    throw collectorError(`${path}_LINES_REQUIRED`);
  }

  const lines = value.lines.map((line, index) => normalizeLine(line, `${path}_${index}`));
  const lineKeys = new Set();
  for (const line of lines) {
    if (lineKeys.has(line.line_key)) {
      throw collectorError(`${path}_LINE_DUPLICATE`);
    }
    lineKeys.add(line.line_key);
  }

  return Object.freeze({
    invoice_key: requiredString(value.invoice_key, `${path}_INVOICE_KEY_INVALID`),
    lines: Object.freeze([...lines].sort((left, right) => left.line_key.localeCompare(right.line_key)))
  });
}

function normalizeSnapshot(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw collectorError(code);
  }

  const branch = branchIdentity(value);
  if (!Array.isArray(value.invoices)) {
    throw collectorError("KDS_P7P8_SOURCE_INVOICES_REQUIRED");
  }

  const invoices = value.invoices.map((invoice, index) => normalizeInvoice(invoice, `KDS_P7P8_${index}`));
  const invoiceKeys = new Set();
  for (const invoice of invoices) {
    if (invoiceKeys.has(invoice.invoice_key)) {
      throw collectorError("KDS_P7P8_INVOICE_DUPLICATE");
    }
    invoiceKeys.add(invoice.invoice_key);
  }

  return Object.freeze({
    branch,
    complete: exactBoolean(value.complete, "KDS_P7P8_SOURCE_COMPLETENESS_REQUIRED"),
    invoices: Object.freeze([...invoices].sort((left, right) => left.invoice_key.localeCompare(right.invoice_key)))
  });
}

function cupCount(invoices) {
  return invoices.reduce(
    (total, invoice) => total + invoice.lines.reduce((sum, line) => sum + line.quantity, 0),
    0
  );
}

function sameLine(left, right) {
  return left.item_id === right.item_id &&
    left.variant_id === right.variant_id &&
    left.quantity === right.quantity &&
    JSON.stringify(left.modifiers) === JSON.stringify(right.modifiers);
}

function compareExactInvoices({ source_snapshot, projected_snapshot, recovery_complete, modifiers_verified } = {}) {
  const source = normalizeSnapshot(source_snapshot, "KDS_P7P8_SOURCE_SNAPSHOT_REQUIRED");
  const projected = normalizeSnapshot(projected_snapshot, "KDS_P7P8_PROJECTED_SNAPSHOT_REQUIRED");

  if (
    source.branch.pos_parent !== projected.branch.pos_parent ||
    source.branch.pos_id !== projected.branch.pos_id
  ) {
    throw collectorError("KDS_P7P8_BRANCH_MISMATCH");
  }

  const sourceByInvoice = new Map(source.invoices.map(invoice => [invoice.invoice_key, invoice]));
  const projectedByInvoice = new Map(projected.invoices.map(invoice => [invoice.invoice_key, invoice]));
  let missingInvoiceCount = 0;
  let extraInvoiceCount = 0;
  let itemPassCount = 0;
  let itemFailCount = 0;

  for (const [invoiceKey, sourceInvoice] of sourceByInvoice) {
    const projectedInvoice = projectedByInvoice.get(invoiceKey);
    if (!projectedInvoice) {
      missingInvoiceCount++;
      itemFailCount++;
      continue;
    }

    const projectedLines = new Map(projectedInvoice.lines.map(line => [line.line_key, line]));
    const linesExact = sourceInvoice.lines.length === projectedInvoice.lines.length &&
      sourceInvoice.lines.every(line => {
        const candidate = projectedLines.get(line.line_key);
        return candidate && sameLine(line, candidate);
      });

    if (linesExact) itemPassCount++;
    else itemFailCount++;
  }

  for (const invoiceKey of projectedByInvoice.keys()) {
    if (!sourceByInvoice.has(invoiceKey)) extraInvoiceCount++;
  }

  return Object.freeze({
    branch: source.branch,
    source_invoice_count: source.invoices.length,
    projected_invoice_count: projected.invoices.length,
    missing_invoice_count: missingInvoiceCount,
    extra_invoice_count: extraInvoiceCount,
    item_pass_count: itemPassCount,
    item_fail_count: itemFailCount,
    cup_expected_count: cupCount(source.invoices),
    cup_projected_count: cupCount(projected.invoices),
    source_snapshot_complete: source.complete,
    recovery_complete: exactBoolean(recovery_complete, "KDS_P7P8_RECOVERY_REQUIRED"),
    modifiers_verified: exactBoolean(modifiers_verified, "KDS_P7P8_MODIFIERS_REQUIRED"),
    source_snapshot_digest: digest(source)
  });
}

module.exports = {
  compareExactInvoices
};
