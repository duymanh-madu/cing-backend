"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const {
  SUPPORTED_LOG_TYPE,
  SUPPORTED_LOG_TYPES,
  normalizeFabiC04EventV1
} = require(
  "../cingKdsFabiC04EventNormalizerV1"
);

const {
  projectFabiC04StateV1
} = require(
  "../cingKdsFabiC04SignedDeltaReducerV1"
);

const {
  LOG_TYPE,
  LOG_TYPES,
  buildRpcArgs
} = require(
  "../cingKdsFabiC04InboxPersistenceAdapterV1"
);

function raw({
  logType = "SALE_CHANGE",
  tranId = "TRAN-64E",
  lineId = "LINE-64E",
  quantity = 1,
  createdAt = 1792050000000
} = {}) {
  return {
    created_at:
      createdAt,

    updated_at:
      createdAt,

    tran_id:
      tranId,

    log_type:
      logType,

    change_data: {
      company_uid:
        "COMPANY",

      brand_uid:
        "BRAND",

      store_uid:
        "STORE",

      tran_id:
        tranId,

      tran_no:
        "640001",

      sale_detail: [
        {
          id_sale_detail:
            lineId,

          tran_id:
            tranId,

          item_id:
            "ITEM",

          item_name:
            "TECHNICAL_ITEM",

          item_class_id:
            "CLASS",

          item_type_id:
            "TYPE",

          unit_id:
            "UNIT",

          quantity,

          price:
            1000,

          note:
            "",

          toppings: []
        }
      ]
    }
  };
}

test(
  "normalizer exposes exact two-type authority",
  () => {
    assert.equal(
      SUPPORTED_LOG_TYPE,
      "SALE_CHANGE"
    );

    assert.deepEqual(
      [...SUPPORTED_LOG_TYPES],
      [
        "SALE_CHANGE",
        "SALE_MERGE_ORDER"
      ]
    );
  }
);

test(
  "persistence adapter exposes same exact two-type authority",
  () => {
    assert.equal(
      LOG_TYPE,
      "SALE_CHANGE"
    );

    assert.deepEqual(
      [...LOG_TYPES],
      [
        "SALE_CHANGE",
        "SALE_MERGE_ORDER"
      ]
    );
  }
);

test(
  "SALE_CHANGE remains accepted end to end",
  () => {
    const event =
      normalizeFabiC04EventV1(
        raw({
          logType:
            "SALE_CHANGE"
        })
      );

    assert.equal(
      event.source_log_type,
      "SALE_CHANGE"
    );

    const args =
      buildRpcArgs(event);

    assert.equal(
      args.p_source_log_type,
      "SALE_CHANGE"
    );
  }
);

test(
  "SALE_MERGE_ORDER is preserved end to end",
  () => {
    const event =
      normalizeFabiC04EventV1(
        raw({
          logType:
            "SALE_MERGE_ORDER"
        })
      );

    assert.equal(
      event.source_log_type,
      "SALE_MERGE_ORDER"
    );

    const args =
      buildRpcArgs(event);

    assert.equal(
      args.p_source_log_type,
      "SALE_MERGE_ORDER"
    );
  }
);

test(
  "mixed proven event set reduces as signed delta",
  () => {
    const a =
      normalizeFabiC04EventV1(
        raw({
          logType:
            "SALE_CHANGE",
          lineId:
            "LINE-A",
          quantity:
            1,
          createdAt:
            1792050000000
        })
      );

    const b =
      normalizeFabiC04EventV1(
        raw({
          logType:
            "SALE_MERGE_ORDER",
          lineId:
            "LINE-B",
          quantity:
            2,
          createdAt:
            1792050001000
        })
      );

    const state =
      projectFabiC04StateV1(
        [a, b]
      );

    assert.equal(
      state.active_line_count,
      2
    );

    assert.equal(
      state.total_quantity,
      3
    );

    assert.equal(
      state.semantics
        .quantity_model,
      "signed_delta"
    );

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
  }
);

test(
  "PRINT_PROVISIONAL remains rejected by normalizer",
  () => {
    assert.throws(
      () =>
        normalizeFabiC04EventV1(
          raw({
            logType:
              "PRINT_PROVISIONAL_INVOICE"
          })
        ),
      /record\.log_type\.unsupported/
    );
  }
);

test(
  "forged unsupported source type is rejected by reducer",
  () => {
    const event =
      normalizeFabiC04EventV1(
        raw()
      );

    assert.throws(
      () =>
        projectFabiC04StateV1([
          {
            ...event,
            source_log_type:
              "PRINT_PROVISIONAL_INVOICE"
          }
        ]),
      /source_log_type\.unsupported/
    );
  }
);

test(
  "forged unsupported source type is rejected by persistence",
  () => {
    const event =
      normalizeFabiC04EventV1(
        raw()
      );

    assert.throws(
      () =>
        buildRpcArgs({
          ...event,
          source_log_type:
            "PRINT_PROVISIONAL_INVOICE"
        }),
      /C04_PERSIST_LOG_TYPE_INVALID/
    );
  }
);

test(
  "event type changes deterministic fingerprint",
  () => {
    const a =
      normalizeFabiC04EventV1(
        raw({
          logType:
            "SALE_CHANGE"
        })
      );

    const b =
      normalizeFabiC04EventV1(
        raw({
          logType:
            "SALE_MERGE_ORDER"
        })
      );

    assert.notEqual(
      a.event_fingerprint,
      b.event_fingerprint
    );
  }
);

test(
  "durable SQL mirrors admit exactly two proven event types",
  () => {
    const db =
      fs.readFileSync(
        "db/migrations/20261015090000_cing_kds_fabi_c04_event_inbox_v1.sql",
        "utf8"
      );

    const sb =
      fs.readFileSync(
        "docs/kds/draft-migrations/r1-original/20261015090000_cing_kds_fabi_c04_event_inbox_v1.sql",
        "utf8"
      );

    assert.equal(
      db,
      sb
    );

    assert.match(
      db,
      /source_log_type in \('SALE_CHANGE', 'SALE_MERGE_ORDER'\)/i
    );

    assert.match(
      db,
      /p_source_log_type is null[\s\S]*p_source_log_type not in \('SALE_CHANGE', 'SALE_MERGE_ORDER'\)/i
    );

    assert.doesNotMatch(
      db,
      /source_log_type in \([^)]*PRINT_PROVISIONAL_INVOICE/i
    );
  }
);
