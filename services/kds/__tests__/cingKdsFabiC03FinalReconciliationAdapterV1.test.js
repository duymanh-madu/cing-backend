"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  createFabiC03FinalReconciliationAdapterV1
} = require(
  "../cingKdsFabiC03FinalReconciliationAdapterV1"
);

function state(
  overrides = {}
) {
  return {
    schema_version:
      "cing_kds_fabi_c04_state_v1",

    source:
      "fabi_c04_sale_change_log",

    tran_id:
      "TRAN-X",

    tran_no:
      "100001",

    unique_event_count:
      2,

    replayed_event_count:
      0,

    first_event_created_at:
      100,

    last_event_created_at:
      200,

    active_line_count:
      1,

    total_quantity:
      2,

    active_lines: [
      {
        canonical_line_id:
          "SD-X",

        item_id:
          "ITEM-X",

        item_name:
          "DRINK X",

        item_class_id:
          "DU",

        item_type_id:
          "TYPE-X",

        unit_id:
          "MON",

        price:
          40000,

        note:
          "C04 NOTE",

        quantity:
          2,

        modifiers: [
          {
            canonical_line_id:
              "TOP-X",

            item_id:
              "TOP-X",

            item_name:
              "TOPPING X",

            item_class_id:
              "TP",

            item_type_id:
              "TOPPING",

            unit_id:
              "MON",

            note:
              "MOD NOTE",

            quantity:
              2
          }
        ]
      }
    ],

    ledger_lines:
      [],

    semantics: {
      quantity_model:
        "signed_delta",

      event_replay:
        "fingerprint_idempotent",

      line_disappearance_is_delete:
        false,

      remove_suffix_required:
        false,

      payment_authority:
        false,

      final_state_authority:
        false,

      c03_reconciliation_required:
        true
    },

    state_fingerprint:
      "STATE-X",

    ...overrides
  };
}

function invoice(
  overrides = {}
) {
  return {
    tran_id:
      "TRAN-X",

    tran_no:
      "100001",

    sale_detail: [
      {
        item_name:
          "DRINK X",

        price:
          40000,

        quantity:
          2,

        unit_id:
          "MON",

        toppings: [
          {
            item_name:
              "TOPPING X"
          }
        ]
      }
    ],

    ...overrides
  };
}

function found(
  invoiceValue =
    invoice()
) {
  return {
    status:
      "found",

    invoices: [
      invoiceValue
    ]
  };
}

test(
  "requires trusted C03 final fetcher",
  () => {
    assert.throws(
      () =>
        createFabiC03FinalReconciliationAdapterV1(),
      /C03_RECON_FETCHER_REQUIRED/
    );
  }
);

test(
  "construction performs no network activity",
  () => {
    let calls = 0;

    createFabiC03FinalReconciliationAdapterV1({
      fetchFinalInvoice:
        async () => {
          calls++;
        }
    });

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "exact C04 state and C03 final invoice match",
  async () => {
    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () =>
            found()
      });

    const result =
      await adapter.reconcile({
        tran_id:
          "TRAN-X",

        state:
          state()
      });

    assert.equal(
      result.authority,
      "c03_paid_final"
    );

    assert.equal(
      result.matched,
      true
    );

    assert.equal(
      result.status,
      "matched"
    );

    assert.equal(
      result.c04_total_quantity,
      2
    );

    assert.equal(
      result.c03_total_quantity,
      2
    );
  }
);

test(
  "parent note difference does not cause false mismatch",
  async () => {
    const modifiedState =
      state();

    modifiedState.active_lines[0]
      .note =
      "ONLY PRESENT IN C04";

    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () =>
            found()
      });

    const result =
      await adapter.reconcile({
        tran_id:
          "TRAN-X",
        state:
          modifiedState
      });

    assert.equal(
      result.matched,
      true
    );
  }
);

test(
  "C04 item_id and class fields are not required on C03 parent",
  async () => {
    const c03 =
      invoice();

    assert.equal(
      "item_id" in
        c03.sale_detail[0],
      false
    );

    assert.equal(
      "item_class_id" in
        c03.sale_detail[0],
      false
    );

    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () =>
            found(c03)
      });

    const result =
      await adapter.reconcile({
        tran_id:
          "TRAN-X",
        state:
          state()
      });

    assert.equal(
      result.matched,
      true
    );
  }
);

test(
  "different topping order still matches",
  async () => {
    const s =
      state({
        active_lines: [
          {
            ...state()
              .active_lines[0],

            modifiers: [
              {
                item_name:
                  "TOP B",
                quantity:
                  2
              },
              {
                item_name:
                  "TOP A",
                quantity:
                  2
              }
            ]
          }
        ]
      });

    const c03 =
      invoice({
        sale_detail: [
          {
            item_name:
              "DRINK X",
            price:
              40000,
            quantity:
              2,
            unit_id:
              "MON",
            toppings: [
              {
                item_name:
                  "TOP A"
              },
              {
                item_name:
                  "TOP B"
              }
            ]
          }
        ]
      });

    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () =>
            found(c03)
      });

    const result =
      await adapter.reconcile({
        tran_id:
          "TRAN-X",
        state:
          s
      });

    assert.equal(
      result.matched,
      true
    );
  }
);

test(
  "C03 not found is pending not mismatch",
  async () => {
    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () => ({
            status:
              "not_found"
          })
      });

    const result =
      await adapter.reconcile({
        tran_id:
          "TRAN-X",
        state:
          state()
      });

    assert.equal(
      result.matched,
      false
    );

    assert.equal(
      result.status,
      "not_final_yet"
    );
  }
);

test(
  "quantity mismatch requires review classification",
  async () => {
    const c03 =
      invoice();

    c03.sale_detail[0]
      .quantity =
      1;

    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () =>
            found(c03)
      });

    const result =
      await adapter.reconcile({
        tran_id:
          "TRAN-X",
        state:
          state()
      });

    assert.equal(
      result.matched,
      false
    );

    assert.equal(
      result.status,
      "mismatch"
    );

    assert.equal(
      result.c04_total_quantity,
      2
    );

    assert.equal(
      result.c03_total_quantity,
      1
    );
  }
);

test(
  "same total with wrong item signature still mismatches",
  async () => {
    const c03 =
      invoice();

    c03.sale_detail[0]
      .item_name =
      "OTHER ITEM";

    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () =>
            found(c03)
      });

    const result =
      await adapter.reconcile({
        tran_id:
          "TRAN-X",
        state:
          state()
      });

    assert.equal(
      result.c04_total_quantity,
      result.c03_total_quantity
    );

    assert.equal(
      result.matched,
      false
    );

    assert.ok(
      result
        .signature_mismatch_count >
      0
    );
  }
);

test(
  "price mismatch is detected",
  async () => {
    const c03 =
      invoice();

    c03.sale_detail[0]
      .price =
      41000;

    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () =>
            found(c03)
      });

    const result =
      await adapter.reconcile({
        tran_id:
          "TRAN-X",
        state:
          state()
      });

    assert.equal(
      result.status,
      "mismatch"
    );
  }
);

test(
  "modifier mismatch is detected",
  async () => {
    const c03 =
      invoice();

    c03.sale_detail[0]
      .toppings[0]
      .item_name =
      "OTHER TOPPING";

    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () =>
            found(c03)
      });

    const result =
      await adapter.reconcile({
        tran_id:
          "TRAN-X",
        state:
          state()
      });

    assert.equal(
      result.status,
      "mismatch"
    );
  }
);

test(
  "foreign C03 tran_id fails closed",
  async () => {
    const c03 =
      invoice({
        tran_id:
          "OTHER"
      });

    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () =>
            found(c03)
      });

    await assert.rejects(
      adapter.reconcile({
        tran_id:
          "TRAN-X",
        state:
          state()
      }),
      /C03_RECON_C03_TRAN_ID_MISMATCH/
    );
  }
);

test(
  "ambiguous C03 final response fails closed",
  async () => {
    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () => ({
            status:
              "found",

            invoices: [
              invoice(),
              invoice()
            ]
          })
      });

    await assert.rejects(
      adapter.reconcile({
        tran_id:
          "TRAN-X",
        state:
          state()
      }),
      /C03_RECON_FINAL_INVOICE_AMBIGUOUS/
    );
  }
);

test(
  "C03 fetch failure is not misclassified as not-final-yet",
  async () => {
    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () => {
            throw new Error(
              "secret upstream error"
            );
          }
      });

    await assert.rejects(
      adapter.reconcile({
        tran_id:
          "TRAN-X",
        state:
          state()
      }),
      error => {
        assert.equal(
          error.code,
          "C03_RECON_FETCH_FAILED"
        );

        assert.equal(
          error.message.includes(
            "secret upstream error"
          ),
          false
        );

        return true;
      }
    );
  }
);

test(
  "forged C04 payment authority fails before C03 fetch",
  async () => {
    let calls = 0;

    const forged =
      state();

    forged.semantics = {
      ...forged.semantics,
      payment_authority:
        true
    };

    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () => {
            calls++;

            return {
              status:
                "not_found"
            };
          }
      });

    await assert.rejects(
      adapter.reconcile({
        tran_id:
          "TRAN-X",
        state:
          forged
      }),
      /C03_RECON_STATE_AUTHORITY_INVALID/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "reconciliation exposes hashes not item names in mismatch evidence",
  async () => {
    const c03 =
      invoice();

    c03.sale_detail[0]
      .item_name =
      "DIFFERENT";

    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async () =>
            found(c03)
      });

    const result =
      await adapter.reconcile({
        tran_id:
          "TRAN-X",
        state:
          state()
      });

    const serialized =
      JSON.stringify(
        result.signature_mismatches
      );

    assert.equal(
      serialized.includes(
        "DRINK X"
      ),
      false
    );

    assert.equal(
      serialized.includes(
        "DIFFERENT"
      ),
      false
    );

    assert.match(
      result
        .signature_mismatches[0]
        .signature_hash,
      /^[a-f0-9]{12}$/
    );
  }
);

test(
  "fetch contract receives transaction identity and event window",
  async () => {
    let input = null;

    const adapter =
      createFabiC03FinalReconciliationAdapterV1({
        fetchFinalInvoice:
          async value => {
            input = value;

            return {
              status:
                "not_found"
            };
          }
      });

    await adapter.reconcile({
      tran_id:
        "TRAN-X",
      state:
        state()
    });

    assert.deepEqual(
      input,
      {
        tran_id:
          "TRAN-X",

        tran_no:
          "100001",

        first_event_created_at:
          100,

        last_event_created_at:
          200
      }
    );
  }
);
