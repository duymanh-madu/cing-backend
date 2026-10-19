"use strict";

/**
 * FABi C03 exported snapshot adapter.
 *
 * READ MODEL ONLY.
 *
 * Does not:
 * - certify source completeness
 * - independently verify payment
 * - interpret changes as immutable events
 * - call FABi or iPOS
 * - mutate any database
 * - expose customer PII
 */

const crypto = require("node:crypto");

const CLASSES = new Set(["DU", "DA", "TP"]);

function fail(reason) {
  const error = new Error(`C03_INVALID:${reason}`);
  error.code = "C03_INVALID";
  throw error;
}

function object(value, path) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    fail(path);
  }
  return value;
}

function string(value, path) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    fail(path);
  }
  return value;
}

function quantity(value, path) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 10000
  ) {
    fail(path);
  }
  return value;
}

function text(value, path) {
  if (value == null) return "";
  if (typeof value !== "string") fail(path);
  return value;
}

function deletionVerification(value, path) {
  if (value === true) {
    fail(`${path}.deleted_true`);
  }

  if (value === false) {
    return "explicit_not_deleted";
  }

  if (
    value === undefined ||
    value === null
  ) {
    return "unverified";
  }

  fail(`${path}.deleted_invalid`);
}

function stable(value) {
  if (Array.isArray(value)) {
    return value.map(stable);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, stable(value[key])])
    );
  }

  return value;
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

function normalizeModifier(source, path) {
  const item = object(source, path);

  const id = string(item.id_sale_detail, `${path}.id`);

  const children = item.sub_topping ?? [];
  if (!Array.isArray(children)) {
    fail(`${path}.sub_topping`);
  }

  if (item.quantity === undefined) {
    fail(`${path}.quantity`);
  }

  return {
    id,
    item_id: string(item.item_id, `${path}.item_id`),
    item_name: string(item.item_name, `${path}.item_name`),
    quantity: quantity(
      item.quantity,
      `${path}.quantity`
    ),
    note: text(item.note, `${path}.note`),
    item_class_id:
      typeof item.item_class_id === "string"
        ? item.item_class_id
        : null,
    item_type_id:
      typeof item.item_type_id === "string"
        ? item.item_type_id
        : null,
    is_eat_with:
      item.is_eat_with === 1 ||
      item.is_eat_with === true,
    children: children.map((child, index) =>
      normalizeModifier(
        child,
        `${path}.sub_topping[${index}]`
      )
    )
  };
}

function normalizeLine(source, index) {
  const path = `sale_detail[${index}]`;
  const item = object(source, path);

  const deletionState =
    deletionVerification(
      item.deleted,
      path
    );

  const category = string(
    item.item_class_id,
    `${path}.item_class_id`
  );

  if (!CLASSES.has(category)) {
    fail(`${path}.unknown_item_class`);
  }

  const id = string(
    item.id_sale_detail,
    `${path}.id_sale_detail`
  );

  const toppings = item.toppings ?? [];
  if (!Array.isArray(toppings)) {
    fail(`${path}.toppings`);
  }

  const line = {
    line_id: id,
    item_id: string(item.item_id, `${path}.item_id`),
    item_name: string(
      item.item_name,
      `${path}.item_name`
    ),
    item_class_id: category,
    item_type_id:
      typeof item.item_type_id === "string"
        ? item.item_type_id
        : null,
    quantity: quantity(
      item.quantity,
      `${path}.quantity`
    ),
    note: text(item.note, `${path}.note`),
    deletion_verification:
      deletionState,
    modifiers: toppings.map((topping, i) =>
      normalizeModifier(
        topping,
        `${path}.toppings[${i}]`
      )
    )
  };

  // A modifier is owned by its parent line.
  // Standalone TP lines are not beverage cups.
  line.production_units =
    category === "DU" ? line.quantity : 0;

  return line;
}

function normalizeInvoice(source, index) {
  const path = `invoices[${index}]`;
  const bill = object(source, path);

  const deletionState =
    deletionVerification(
      bill.deleted,
      path
    );

  const tranId = string(
    bill.tran_id,
    `${path}.tran_id`
  );

  const sourceBrandId =
    typeof bill.brand_id === "string" &&
    bill.brand_id.trim()
      ? bill.brand_id.trim()
      : null;

  const sourceStoreUid =
    typeof bill.store_uid === "string" &&
    bill.store_uid.trim()
      ? bill.store_uid.trim()
      : null;

  const sourceScopeId =
    sourceBrandId ||
    sourceStoreUid;

  if (!sourceScopeId) {
    fail(`${path}.source_scope`);
  }

  const details = bill.sale_detail;

  if (!Array.isArray(details)) {
    fail(`${path}.sale_detail`);
  }

  const lines = details.map(normalizeLine);
  const lineIds = new Set();

  for (const line of lines) {
    if (lineIds.has(line.line_id)) {
      fail(`${path}.duplicate_line_id`);
    }

    lineIds.add(line.line_id);
  }

  const payments = bill.sale_payment_method;
  if (!Array.isArray(payments)) {
    fail(`${path}.sale_payment_method`);
  }

  const reportedPaid = payments.some(
    payment =>
      payment &&
      payment.is_paid === 1 &&
      payment.deleted === false
  );

  // Expand DU quantities into distinct work units.
  // Line identity is retained; modifier arrays remain
  // attached to the parent line, not inferred per unit.
  const cups = [];

  for (const line of lines) {
    if (line.item_class_id !== "DU") continue;

    for (let unit = 0; unit < line.quantity; unit++) {
      cups.push({
        unit_key: `${line.line_id}:${unit}`,
        line_id: line.line_id,
        item_id: line.item_id,
        item_name: line.item_name,
        note: line.note,
        modifiers: line.modifiers
      });
    }
  }

  const invoice = {
    pos_parent: sourceScopeId,
    source_brand_id:
      sourceBrandId,
    source_store_uid:
      sourceStoreUid,
    deletion_verification:
      deletionState,
    device_code:
      typeof bill.device_code === "string"
        ? bill.device_code
        : null,
    tran_id: tranId,
    tran_no: string(
      bill.tran_no,
      `${path}.tran_no`
    ),
    source_tran_date_ms:
      Number.isSafeInteger(bill.tran_date)
        ? bill.tran_date
        : null,
    source_start_date_ms:
      Number.isSafeInteger(bill.start_date)
        ? bill.start_date
        : null,
    source_sale_updated_at_ms:
      Number.isSafeInteger(bill.sale_updated_at)
        ? bill.sale_updated_at
        : null,
    source_reports_paid: reportedPaid,
    source_payment_records_present:
      payments.length > 0,
    source_payment_record_count:
      payments.length,
    payment_verification: "pending_verification",
    source_completeness_verified: false,
    lines,
    cups
  };

  invoice.fingerprint = hash(invoice);

  return invoice;
}

function normalizeC03Snapshot(input) {
  if (!Array.isArray(input)) {
    fail("expected_invoice_array");
  }

  const invoices = input.map(normalizeInvoice);
  const identities = new Set();

  for (const invoice of invoices) {
    const key =
      `${invoice.pos_parent}\u0000${invoice.tran_id}`;

    if (identities.has(key)) {
      fail("duplicate_invoice_identity");
    }

    identities.add(key);
  }

  const totals = {
    invoices: invoices.length,
    lines: invoices.reduce(
      (sum, invoice) =>
        sum + invoice.lines.length,
      0
    ),
    beverage_units: invoices.reduce(
      (sum, invoice) =>
        sum + invoice.cups.length,
      0
    ),
    standalone_topping_units: invoices.reduce(
      (sum, invoice) =>
        sum + invoice.lines
          .filter(line => line.item_class_id === "TP")
          .reduce(
            (count, line) => count + line.quantity,
            0
          ),
      0
    ),
    food_units: invoices.reduce(
      (sum, invoice) =>
        sum + invoice.lines
          .filter(line => line.item_class_id === "DA")
          .reduce(
            (count, line) => count + line.quantity,
            0
          ),
      0
    )
  };

  return {
    schema: "cing_fabi_c03_snapshot_v1",
    operational_status: "dormant",
    source_completeness_verified: false,
    source_freshness_verified: false,
    payment_authority_verified: false,
    reconciliation_verdict: "not_verified",
    totals,
    invoices
  };
}

module.exports = {
  normalizeC03Snapshot
};
