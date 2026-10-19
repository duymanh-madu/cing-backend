"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  normalizeFabiC04EventV1
} = require(
  "../cingKdsFabiC04EventNormalizerV1"
);

const {
  INPUT_SCHEMA,
  OUTPUT_SCHEMA,
  projectFabiC04StateV1
} = require(
  "../cingKdsFabiC04SignedDeltaReducerV1"
);

let sequence = 0;

function rawEvent({
  createdAt,
  tranId = "TRAN-1",
  tranNo = "100001",
  lines
}) {
  sequence++;

  return {
    created_at:
      createdAt,

    updated_at:
      createdAt,

    tran_id:
      tranId,

    log_type:
      "SALE_CHANGE",

    fmt_created_at:
      `2026-10-15 12:00:${String(sequence).padStart(2, "0")}`,

    change_data: {
      tran_id:
        tranId,

      tran_no:
        tranNo,

      store_uid:
        "STORE",

      brand_uid:
        "BRAND",

      company_uid:
        "COMPANY",

      sale_detail:
        lines
    }
  };
}

function line({
  id = "SD-L1",
  itemId = "ITEM-A",
  itemName = "ITEM A",
  itemClass = "DU",
  itemType = "TYPE-A",
  qty = 1,
  note = "",
  toppings = []
} = {}) {
  return {
    id_sale_detail:
      id,

    item_id:
      itemId,

    item_name:
      itemName,

    item_class_id:
      itemClass,

    item_type_id:
      itemType,

    quantity:
      qty,

    note,

    status:
      "COOKING",

    sort_index:
      1,

    request_kds_before_del:
      0,

    unit_id:
      "MON",

    price:
      40000,

    toppings
  };
}

function topping({
  id = "TOP-1",
  itemId = "TOPPING-A",
  qty = 1
} = {}) {
  return {
    id_sale_detail:
      id,

    item_id:
      itemId,

    item_name:
      "TOPPING A",

    item_class_id:
      "TP",

    item_type_id:
      "TOPPING",

    quantity:
      qty,

    note:
      "",

    check_active:
      0,

    unit_id:
      "MON"
  };
}

function normalized(args) {
  return normalizeFabiC04EventV1(
    rawEvent(args)
  );
}

test(
  "exports exact reducer schema contracts",
  () => {
    assert.equal(
      INPUT_SCHEMA,
      "cing_kds_fabi_c04_event_v1"
    );

    assert.equal(
      OUTPUT_SCHEMA,
      "cing_kds_fabi_c04_state_v1"
    );
  }
);

test(
  "single positive delta creates active state",
  () => {
    const state =
      projectFabiC04StateV1([
        normalized({
          createdAt: 100,
          lines: [
            line({
              qty: 2
            })
          ]
        })
      ]);

    assert.equal(
      state.active_line_count,
      1
    );

    assert.equal(
      state.total_quantity,
      2
    );

    assert.equal(
      state.active_lines[0]
        .quantity,
      2
    );
  }
);

test(
  "repeated positive deltas on same logical line accumulate",
  () => {
    const a =
      normalized({
        createdAt: 100,
        lines: [
          line({
            qty: 1
          })
        ]
      });

    const b =
      normalized({
        createdAt: 200,
        lines: [
          line({
            qty: 2
          })
        ]
      });

    const state =
      projectFabiC04StateV1(
        [a, b]
      );

    assert.equal(
      state.active_line_count,
      1
    );

    assert.equal(
      state.total_quantity,
      3
    );
  }
);

test(
  "_REMOVE reversal cancels original logical line",
  () => {
    const add =
      normalized({
        createdAt: 100,
        lines: [
          line({
            id: "SD-L1",
            qty: 1
          })
        ]
      });

    const remove =
      normalized({
        createdAt: 200,
        lines: [
          line({
            id:
              "SD-L1_REMOVE",
            qty:
              -1
          })
        ]
      });

    const state =
      projectFabiC04StateV1(
        [add, remove]
      );

    assert.equal(
      state.active_line_count,
      0
    );

    assert.equal(
      state.total_quantity,
      0
    );

    assert.equal(
      state.ledger_lines[0]
        .net_quantity,
      0
    );
  }
);

test(
  "negative reversal does not require _REMOVE suffix",
  () => {
    const add =
      normalized({
        createdAt: 100,
        lines: [
          line({
            qty: 2
          })
        ]
      });

    const reverse =
      normalized({
        createdAt: 200,
        lines: [
          line({
            qty: -1
          })
        ]
      });

    const state =
      projectFabiC04StateV1(
        [add, reverse]
      );

    assert.equal(
      state.total_quantity,
      1
    );

    assert.equal(
      state.active_lines[0]
        .quantity,
      1
    );
  }
);

test(
  "multiple exact item lines remain distinct by canonical line identity",
  () => {
    const event =
      normalized({
        createdAt: 100,
        lines: [
          line({
            id: "SD-A",
            qty: 1
          }),
          line({
            id: "SD-B",
            qty: 2
          })
        ]
      });

    const state =
      projectFabiC04StateV1(
        [event]
      );

    assert.equal(
      state.active_line_count,
      2
    );

    assert.equal(
      state.total_quantity,
      3
    );
  }
);

test(
  "exact replay is idempotent by event fingerprint",
  () => {
    const event =
      normalized({
        createdAt: 100,
        lines: [
          line({
            qty: 2
          })
        ]
      });

    const state =
      projectFabiC04StateV1(
        [event, event]
      );

    assert.equal(
      state.unique_event_count,
      1
    );

    assert.equal(
      state.replayed_event_count,
      1
    );

    assert.equal(
      state.total_quantity,
      2
    );
  }
);

test(
  "different transactions cannot be reduced together",
  () => {
    const a =
      normalized({
        createdAt: 100,
        tranId: "TRAN-A",
        lines: [line()]
      });

    const b =
      normalized({
        createdAt: 200,
        tranId: "TRAN-B",
        lines: [line()]
      });

    assert.throws(
      () =>
        projectFabiC04StateV1(
          [a, b]
        ),
      /transaction_mismatch/
    );
  }
);

test(
  "unsupported input schema fails closed",
  () => {
    const event =
      normalized({
        createdAt: 100,
        lines: [line()]
      });

    const bad = {
      ...event,
      schema_version:
        "other_schema"
    };

    assert.throws(
      () =>
        projectFabiC04StateV1(
          [bad]
        ),
      /schema_version\.unsupported/
    );
  }
);

test(
  "same canonical line cannot silently change item identity",
  () => {
    const a =
      normalized({
        createdAt: 100,
        lines: [
          line({
            itemId: "ITEM-A"
          })
        ]
      });

    const b =
      normalized({
        createdAt: 200,
        lines: [
          line({
            itemId: "ITEM-B"
          })
        ]
      });

    assert.throws(
      () =>
        projectFabiC04StateV1(
          [a, b]
        ),
      /line_identity_changed/
    );
  }
);

test(
  "same canonical line cannot silently change note",
  () => {
    const a =
      normalized({
        createdAt: 100,
        lines: [
          line({
            note: "A"
          })
        ]
      });

    const b =
      normalized({
        createdAt: 200,
        lines: [
          line({
            note: "B"
          })
        ]
      });

    assert.throws(
      () =>
        projectFabiC04StateV1(
          [a, b]
        ),
      /line_identity_changed/
    );
  }
);

test(
  "final negative line quantity fails closed",
  () => {
    const reverseOnly =
      normalized({
        createdAt: 100,
        lines: [
          line({
            qty: -1
          })
        ]
      });

    assert.throws(
      () =>
        projectFabiC04StateV1(
          [reverseOnly]
        ),
      /line_final_negative/
    );
  }
);

test(
  "signed topping deltas reduce independently",
  () => {
    const add =
      normalized({
        createdAt: 100,
        lines: [
          line({
            qty: 2,
            toppings: [
              topping({
                qty: 2
              })
            ]
          })
        ]
      });

    const reverse =
      normalized({
        createdAt: 200,
        lines: [
          line({
            qty: -1,
            toppings: [
              topping({
                qty: -1
              })
            ]
          })
        ]
      });

    const state =
      projectFabiC04StateV1(
        [add, reverse]
      );

    assert.equal(
      state.total_quantity,
      1
    );

    assert.equal(
      state.active_lines[0]
        .modifiers[0]
        .quantity,
      1
    );
  }
);

test(
  "modifier identity mutation fails closed",
  () => {
    const add =
      normalized({
        createdAt: 100,
        lines: [
          line({
            toppings: [
              topping({
                itemId:
                  "TOP-A"
              })
            ]
          })
        ]
      });

    const again =
      normalized({
        createdAt: 200,
        lines: [
          line({
            toppings: [
              topping({
                itemId:
                  "TOP-B"
              })
            ]
          })
        ]
      });

    assert.throws(
      () =>
        projectFabiC04StateV1(
          [add, again]
        ),
      /modifier_identity_changed/
    );
  }
);

test(
  "removed parent cannot retain active modifier balance",
  () => {
    const add =
      normalized({
        createdAt: 100,
        lines: [
          line({
            qty: 1,
            toppings: [
              topping({
                qty: 1
              })
            ]
          })
        ]
      });

    const reverseParentOnly =
      normalized({
        createdAt: 200,
        lines: [
          line({
            qty: -1,
            toppings: []
          })
        ]
      });

    assert.throws(
      () =>
        projectFabiC04StateV1(
          [
            add,
            reverseParentOnly
          ]
        ),
      /removed_line_has_active_modifier/
    );
  }
);

test(
  "event input order does not change final state",
  () => {
    const early =
      normalized({
        createdAt: 100,
        lines: [
          line({
            qty: 2
          })
        ]
      });

    const later =
      normalized({
        createdAt: 200,
        lines: [
          line({
            qty: -1
          })
        ]
      });

    const a =
      projectFabiC04StateV1(
        [early, later]
      );

    const b =
      projectFabiC04StateV1(
        [later, early]
      );

    assert.equal(
      a.state_fingerprint,
      b.state_fingerprint
    );
  }
);

test(
  "projection carries no payment or final-state authority",
  () => {
    const state =
      projectFabiC04StateV1([
        normalized({
          createdAt: 100,
          lines: [line()]
        })
      ]);

    assert.equal(
      state.semantics
        .payment_authority,
      false
    );

    assert.equal(
      state.semantics
        .final_state_authority,
      false
    );

    assert.equal(
      state.semantics
        .c03_reconciliation_required,
      true
    );
  }
);

test(
  "projection is deterministic and deeply immutable",
  () => {
    const event =
      normalized({
        createdAt: 100,
        lines: [
          line({
            qty: 2
          })
        ]
      });

    const a =
      projectFabiC04StateV1(
        [event]
      );

    const b =
      projectFabiC04StateV1(
        [event]
      );

    assert.match(
      a.state_fingerprint,
      /^[a-f0-9]{64}$/
    );

    assert.equal(
      a.state_fingerprint,
      b.state_fingerprint
    );

    assert.equal(
      Object.isFrozen(a),
      true
    );

    assert.equal(
      Object.isFrozen(
        a.active_lines
      ),
      true
    );

    assert.equal(
      Object.isFrozen(
        a.ledger_lines
      ),
      true
    );

    assert.equal(
      Object.isFrozen(
        a.semantics
      ),
      true
    );
  }
);
