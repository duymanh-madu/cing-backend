"use strict";

const crypto =
  require("node:crypto");

const AUTHORITY =
  "c03_paid_final";

function adapterError(code) {
  const error =
    new Error(code);

  error.code =
    code;

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
    throw adapterError(code);
  }

  return value.trim();
}

function finitePositive(
  value,
  code
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    throw adapterError(code);
  }

  return number;
}

function modifierNamesFromC04(line) {
  const modifiers =
    Array.isArray(
      line?.modifiers
    )
      ? line.modifiers
      : [];

  return modifiers
    .map(modifier =>
      String(
        modifier?.item_name || ""
      ).trim()
    )
    .filter(Boolean)
    .sort();
}

function modifierNamesFromC03(line) {
  const toppings =
    Array.isArray(
      line?.toppings
    )
      ? line.toppings
      : [];

  return toppings
    .map(topping =>
      String(
        topping?.item_name || ""
      ).trim()
    )
    .filter(Boolean)
    .sort();
}

function sharedSignature({
  itemName,
  price,
  unitId,
  modifiers
}) {
  return JSON.stringify({
    item_name:
      String(
        itemName || ""
      ).trim(),

    price:
      Number(price) || 0,

    unit_id:
      String(
        unitId || ""
      ).trim(),

    toppings:
      [...modifiers].sort()
  });
}

function signatureC04(line) {
  return sharedSignature({
    itemName:
      line?.item_name,

    price:
      line?.price,

    unitId:
      line?.unit_id,

    modifiers:
      modifierNamesFromC04(
        line
      )
  });
}

function signatureC03(line) {
  return sharedSignature({
    itemName:
      line?.item_name,

    price:
      line?.price,

    unitId:
      line?.unit_id,

    modifiers:
      modifierNamesFromC03(
        line
      )
  });
}

function hashSignature(signature) {
  return crypto
    .createHash("sha256")
    .update(signature)
    .digest("hex")
    .slice(0, 12);
}

function validateC04State(
  state,
  tranId
) {
  if (!isPlainObject(state)) {
    throw adapterError(
      "C03_RECON_STATE_INVALID"
    );
  }

  if (
    state.schema_version !==
    "cing_kds_fabi_c04_state_v1"
  ) {
    throw adapterError(
      "C03_RECON_STATE_SCHEMA_INVALID"
    );
  }

  if (
    state.tran_id !==
    tranId
  ) {
    throw adapterError(
      "C03_RECON_STATE_TRAN_MISMATCH"
    );
  }

  if (
    !Array.isArray(
      state.active_lines
    )
  ) {
    throw adapterError(
      "C03_RECON_STATE_LINES_INVALID"
    );
  }

  if (
    !isPlainObject(
      state.semantics
    ) ||
    state.semantics
      .payment_authority !==
      false ||
    state.semantics
      .final_state_authority !==
      false ||
    state.semantics
      .c03_reconciliation_required !==
      true
  ) {
    throw adapterError(
      "C03_RECON_STATE_AUTHORITY_INVALID"
    );
  }

  return state;
}

function aggregateC04(state) {
  const map =
    new Map();

  for (
    let index = 0;
    index < state.active_lines.length;
    index++
  ) {
    const line =
      state.active_lines[index];

    if (!isPlainObject(line)) {
      throw adapterError(
        "C03_RECON_C04_LINE_INVALID"
      );
    }

    const quantity =
      finitePositive(
        line.quantity,
        "C03_RECON_C04_QTY_INVALID"
      );

    const signature =
      signatureC04(line);

    map.set(
      signature,
      (map.get(signature) || 0) +
      quantity
    );
  }

  return map;
}

function validateC03Invoice(
  invoice,
  expectedTranId,
  expectedTranNo
) {
  if (!isPlainObject(invoice)) {
    throw adapterError(
      "C03_RECON_INVOICE_INVALID"
    );
  }

  const tranId =
    requiredString(
      invoice.tran_id,
      "C03_RECON_C03_TRAN_ID_INVALID"
    );

  if (
    tranId !==
    expectedTranId
  ) {
    throw adapterError(
      "C03_RECON_C03_TRAN_ID_MISMATCH"
    );
  }

  if (
    expectedTranNo !== null &&
    expectedTranNo !== undefined
  ) {
    const tranNo =
      requiredString(
        invoice.tran_no,
        "C03_RECON_C03_TRAN_NO_INVALID"
      )
        .split(" ")[0];

    if (
      tranNo !==
      expectedTranNo
    ) {
      throw adapterError(
        "C03_RECON_C03_TRAN_NO_MISMATCH"
      );
    }
  }

  if (
    !Array.isArray(
      invoice.sale_detail
    )
  ) {
    throw adapterError(
      "C03_RECON_C03_LINES_INVALID"
    );
  }

  return invoice;
}

function aggregateC03(invoice) {
  const map =
    new Map();

  for (
    let index = 0;
    index < invoice.sale_detail.length;
    index++
  ) {
    const line =
      invoice.sale_detail[index];

    if (!isPlainObject(line)) {
      throw adapterError(
        "C03_RECON_C03_LINE_INVALID"
      );
    }

    const quantity =
      finitePositive(
        line.quantity,
        "C03_RECON_C03_QTY_INVALID"
      );

    const signature =
      signatureC03(line);

    map.set(
      signature,
      (map.get(signature) || 0) +
      quantity
    );
  }

  return map;
}

function compareMaps(
  c04,
  c03
) {
  const signatures =
    new Set([
      ...c04.keys(),
      ...c03.keys()
    ]);

  const mismatches = [];

  for (
    const signature
    of signatures
  ) {
    const c04Qty =
      c04.get(signature) || 0;

    const c03Qty =
      c03.get(signature) || 0;

    if (c04Qty !== c03Qty) {
      mismatches.push({
        signature_hash:
          hashSignature(
            signature
          ),

        c04_quantity:
          c04Qty,

        c03_quantity:
          c03Qty
      });
    }
  }

  mismatches.sort(
    (a, b) =>
      a.signature_hash
        .localeCompare(
          b.signature_hash
        )
  );

  return mismatches;
}

function totalQuantity(map) {
  return [...map.values()]
    .reduce(
      (sum, quantity) =>
        sum + quantity,
      0
    );
}

function createFabiC03FinalReconciliationAdapterV1({
  fetchFinalInvoice
} = {}) {
  if (
    typeof fetchFinalInvoice !==
    "function"
  ) {
    throw adapterError(
      "C03_RECON_FETCHER_REQUIRED"
    );
  }

  async function reconcile({
    tran_id,
    state
  } = {}) {
    const tranId =
      requiredString(
        tran_id,
        "C03_RECON_TRAN_ID_REQUIRED"
      );

    validateC04State(
      state,
      tranId
    );

    const tranNo =
      state.tran_no === null ||
      state.tran_no === undefined
        ? null
        : requiredString(
            state.tran_no,
            "C03_RECON_TRAN_NO_INVALID"
          );

    let fetched;

    try {
      fetched =
        await fetchFinalInvoice({
          tran_id:
            tranId,

          tran_no:
            tranNo,

          first_event_created_at:
            state
              .first_event_created_at,

          last_event_created_at:
            state
              .last_event_created_at
        });
    } catch (_) {
      /*
       * Upstream availability/auth/rate-limit errors
       * are not equivalent to "not final yet".
       * Fail closed so coordinator cannot mark READY.
       */
      throw adapterError(
        "C03_RECON_FETCH_FAILED"
      );
    }

    if (!isPlainObject(fetched)) {
      throw adapterError(
        "C03_RECON_FETCH_RESULT_INVALID"
      );
    }

    if (
      fetched.status ===
      "not_found"
    ) {
      return Object.freeze({
        authority:
          AUTHORITY,

        matched:
          false,

        status:
          "not_final_yet",

        tran_id:
          tranId
      });
    }

    if (
      fetched.status !==
      "found"
    ) {
      throw adapterError(
        "C03_RECON_FETCH_STATUS_INVALID"
      );
    }

    const invoices =
      fetched.invoices;

    if (!Array.isArray(invoices)) {
      throw adapterError(
        "C03_RECON_FETCH_INVOICES_INVALID"
      );
    }

    if (invoices.length !== 1) {
      throw adapterError(
        "C03_RECON_FINAL_INVOICE_AMBIGUOUS"
      );
    }

    const invoice =
      validateC03Invoice(
        invoices[0],
        tranId,
        tranNo
      );

    const c04 =
      aggregateC04(
        state
      );

    const c03 =
      aggregateC03(
        invoice
      );

    const c04Total =
      totalQuantity(c04);

    const c03Total =
      totalQuantity(c03);

    const mismatches =
      compareMaps(
        c04,
        c03
      );

    const matched =
      c04Total === c03Total &&
      mismatches.length === 0;

    if (!matched) {
      return Object.freeze({
        authority:
          AUTHORITY,

        matched:
          false,

        status:
          "mismatch",

        tran_id:
          tranId,

        c04_total_quantity:
          c04Total,

        c03_total_quantity:
          c03Total,

        signature_mismatch_count:
          mismatches.length,

        signature_mismatches:
          Object.freeze(
            mismatches.map(
              item =>
                Object.freeze(item)
            )
          )
      });
    }

    return Object.freeze({
      authority:
        AUTHORITY,

      matched:
        true,

      status:
        "matched",

      tran_id:
        tranId,

      c04_total_quantity:
        c04Total,

      c03_total_quantity:
        c03Total,

      signature_mismatch_count:
        0
    });
  }

  return Object.freeze({
    reconcile
  });
}

module.exports = {
  AUTHORITY,
  signatureC04,
  signatureC03,
  createFabiC03FinalReconciliationAdapterV1
};
