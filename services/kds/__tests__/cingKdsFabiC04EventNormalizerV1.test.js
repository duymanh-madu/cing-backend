"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SOURCE,
  SUPPORTED_LOG_TYPE,
  canonicalDetailId,
  normalizeFabiC04EventV1
} = require(
  "../cingKdsFabiC04EventNormalizerV1"
);

function baseRecord(overrides = {}) {
  return {
    created_at: 1791712257,
    updated_at: 1791712257,
    tran_id: "TRAN-001",
    log_type: "SALE_CHANGE",
    fmt_created_at:
      "2026-10-11 16:50:57:490000",

    change_data: {
      company_uid: "COMPANY-1",
      brand_uid: "BRAND-1",
      store_uid: "STORE-1",

      tran_id: "TRAN-001",
      tran_no: "120151",

      sale_detail: [
        {
          id_sale_detail:
            "SD_TRAN-001_LINE-A",

          item_id:
            "ITEM-A",

          item_name:
            "DRINK A",

          item_class_id:
            "DU",

          item_class_name:
            "Đồ uống",

          item_type_id:
            "TCDD",

          item_type_name:
            "SỮA TƯƠI TCDD",

          quantity: 2,

          note: "",

          status:
            "COOKING",

          sort_index: 1,

          request_kds_before_del: 0,

          unit_id:
            "MON",

          price:
            41000,

          toppings: []
        }
      ],

      ...(overrides.change_data || {})
    },

    ...Object.fromEntries(
      Object.entries(overrides)
        .filter(([key]) => key !== "change_data")
    )
  };
}

test(
  "exports exact source contract",
  () => {
    assert.equal(
      SOURCE,
      "fabi_c04_sale_change_log"
    );

    assert.equal(
      SUPPORTED_LOG_TYPE,
      "SALE_CHANGE"
    );
  }
);

test(
  "canonicalDetailId strips only terminal _REMOVE",
  () => {
    assert.equal(
      canonicalDetailId(
        "SD_ABC_REMOVE"
      ),
      "SD_ABC"
    );

    assert.equal(
      canonicalDetailId(
        "SD_REMOVE_ABC"
      ),
      "SD_REMOVE_ABC"
    );
  }
);

test(
  "normalizes positive SALE_CHANGE delta",
  () => {
    const out =
      normalizeFabiC04EventV1(
        baseRecord()
      );

    assert.equal(
      out.schema_version,
      "cing_kds_fabi_c04_event_v1"
    );

    assert.equal(
      out.tran_id,
      "TRAN-001"
    );

    assert.equal(
      out.tran_no,
      "120151"
    );

    assert.equal(
      out.lines.length,
      1
    );

    assert.equal(
      out.lines[0].quantity_delta,
      2
    );

    assert.equal(
      out.lines[0].direction,
      "positive"
    );

    assert.equal(
      out.lines[0].canonical_line_id,
      "SD_TRAN-001_LINE-A"
    );

    assert.equal(
      out.lines[0].remove_suffix_present,
      false
    );
  }
);

test(
  "normalizes negative delta without requiring _REMOVE suffix",
  () => {
    const record =
      baseRecord();

    record.change_data.sale_detail[0].quantity =
      -2;

    const out =
      normalizeFabiC04EventV1(
        record
      );

    assert.equal(
      out.lines[0].quantity_delta,
      -2
    );

    assert.equal(
      out.lines[0].direction,
      "negative"
    );

    assert.equal(
      out.lines[0].remove_suffix_present,
      false
    );
  }
);

test(
  "_REMOVE raw identity is preserved while canonical identity is stripped",
  () => {
    const record =
      baseRecord();

    record.change_data.sale_detail[0].id_sale_detail =
      "SD_TRAN-001_LINE-A_REMOVE";

    record.change_data.sale_detail[0].quantity =
      -2;

    const out =
      normalizeFabiC04EventV1(
        record
      );

    assert.equal(
      out.lines[0].raw_id_sale_detail,
      "SD_TRAN-001_LINE-A_REMOVE"
    );

    assert.equal(
      out.lines[0].canonical_line_id,
      "SD_TRAN-001_LINE-A"
    );

    assert.equal(
      out.lines[0].remove_suffix_present,
      true
    );
  }
);

test(
  "normalizes signed topping delta independently",
  () => {
    const record =
      baseRecord();

    record.change_data.sale_detail[0].quantity =
      -1;

    record.change_data.sale_detail[0].toppings =
      [
        {
          id_sale_detail:
            "SDTOP_TRAN-001_TOP-A",

          item_id:
            "TOPPING-A",

          item_name:
            "TOPPING A",

          item_class_id:
            "TP",

          item_type_id:
            "TOPPING",

          quantity:
            -1,

          note:
            "",

          check_active:
            0,

          raw_quantity:
            1,

          unit_id:
            "MON",

          is_eat_with:
            1
        }
      ];

    const out =
      normalizeFabiC04EventV1(
        record
      );

    assert.equal(
      out.lines[0].toppings.length,
      1
    );

    assert.equal(
      out.lines[0].toppings[0].quantity_delta,
      -1
    );

    assert.equal(
      out.lines[0].toppings[0].direction,
      "negative"
    );

    assert.equal(
      out.lines[0].toppings[0].check_active,
      0
    );
  }
);

test(
  "preserves exact note text without interpreting semantics",
  () => {
    const record =
      baseRecord();

    record.change_data.sale_detail[0].note =
      "ít đá";

    const out =
      normalizeFabiC04EventV1(
        record
      );

    assert.equal(
      out.lines[0].note,
      "ít đá"
    );
  }
);

test(
  "rejects non SALE_CHANGE log types",
  () => {
    assert.throws(
      () =>
        normalizeFabiC04EventV1(
          baseRecord({
            log_type:
              "PRINT_PROVISIONAL_INVOICE"
          })
        ),
      /C04_INVALID:record\.log_type\.unsupported/
    );
  }
);

test(
  "rejects zero quantity because SALE_CHANGE must be an actual delta",
  () => {
    const record =
      baseRecord();

    record.change_data.sale_detail[0].quantity =
      0;

    assert.throws(
      () =>
        normalizeFabiC04EventV1(
          record
        ),
      /C04_INVALID:record\.change_data\.sale_detail\[0\]\.quantity\.nonzero_number_required/
    );
  }
);

test(
  "rejects missing stable parent line identity",
  () => {
    const record =
      baseRecord();

    delete record.change_data.sale_detail[0]
      .id_sale_detail;

    assert.throws(
      () =>
        normalizeFabiC04EventV1(
          record
        ),
      /id_sale_detail\.string_required/
    );
  }
);

test(
  "rejects missing item authority fields",
  () => {
    for (const field of [
      "item_id",
      "item_name",
      "item_class_id",
      "item_type_id"
    ]) {
      const record =
        baseRecord();

      delete record.change_data.sale_detail[0][field];

      assert.throws(
        () =>
          normalizeFabiC04EventV1(
            record
          ),
        new RegExp(
          `${field}\\.string_required`
        )
      );
    }
  }
);

test(
  "rejects tran_id mismatch between envelope and change_data",
  () => {
    const record =
      baseRecord();

    record.change_data.tran_id =
      "OTHER-TRAN";

    assert.throws(
      () =>
        normalizeFabiC04EventV1(
          record
        ),
      /change_data\.tran_id\.mismatch/
    );
  }
);

test(
  "does not expose customer PII from extra_data",
  () => {
    const record =
      baseRecord();

    record.change_data.extra_data =
      {
        customer_name:
          "PRIVATE NAME",

        customer_phone:
          "84900000000",

        customer_email:
          "private@example.com",

        customer_address:
          "PRIVATE ADDRESS"
      };

    const out =
      normalizeFabiC04EventV1(
        record
      );

    const serialized =
      JSON.stringify(out);

    assert.equal(
      serialized.includes(
        "PRIVATE NAME"
      ),
      false
    );

    assert.equal(
      serialized.includes(
        "84900000000"
      ),
      false
    );

    assert.equal(
      serialized.includes(
        "private@example.com"
      ),
      false
    );

    assert.equal(
      serialized.includes(
        "PRIVATE ADDRESS"
      ),
      false
    );
  }
);

test(
  "explicitly carries no payment or final-state authority",
  () => {
    const out =
      normalizeFabiC04EventV1(
        baseRecord()
      );

    assert.equal(
      out.semantics.payment_authority,
      false
    );

    assert.equal(
      out.semantics.final_state_authority,
      false
    );

    assert.equal(
      out.semantics.full_snapshot,
      false
    );

    assert.equal(
      out.semantics.disappearance_is_delete,
      false
    );

    assert.equal(
      out.semantics.quantity_model,
      "signed_delta"
    );
  }
);

test(
  "fingerprint is deterministic for equivalent input",
  () => {
    const a =
      normalizeFabiC04EventV1(
        baseRecord()
      );

    const b =
      normalizeFabiC04EventV1(
        baseRecord()
      );

    assert.match(
      a.event_fingerprint,
      /^[a-f0-9]{64}$/
    );

    assert.equal(
      a.event_fingerprint,
      b.event_fingerprint
    );
  }
);

test(
  "fingerprint changes when signed quantity changes",
  () => {
    const positive =
      baseRecord();

    const negative =
      baseRecord();

    negative.change_data.sale_detail[0].quantity =
      -2;

    const a =
      normalizeFabiC04EventV1(
        positive
      );

    const b =
      normalizeFabiC04EventV1(
        negative
      );

    assert.notEqual(
      a.event_fingerprint,
      b.event_fingerprint
    );
  }
);

test(
  "result is deeply immutable",
  () => {
    const out =
      normalizeFabiC04EventV1(
        baseRecord()
      );

    assert.equal(
      Object.isFrozen(out),
      true
    );

    assert.equal(
      Object.isFrozen(out.lines),
      true
    );

    assert.equal(
      Object.isFrozen(out.lines[0]),
      true
    );

    assert.equal(
      Object.isFrozen(out.lines[0].toppings),
      true
    );

    assert.equal(
      Object.isFrozen(out.semantics),
      true
    );
  }
);
