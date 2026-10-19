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
  RPC_NAME,
  buildRpcArgs,
  createFabiC04InboxPersistenceAdapterV1
} = require(
  "../cingKdsFabiC04InboxPersistenceAdapterV1"
);

function normalizedEvent(
  overrides = {}
) {
  const raw = {
    created_at:
      1792050000000,

    updated_at:
      1792050000000,

    tran_id:
      "TRAN-63B",

    log_type:
      "SALE_CHANGE",

    change_data: {
      company_uid:
        "COMPANY",

      brand_uid:
        "BRAND",

      store_uid:
        "STORE",

      tran_id:
        "TRAN-63B",

      tran_no:
        "160001",

      sale_detail: [
        {
          id_sale_detail:
            "SD-63B-L1",

          item_id:
            "ITEM-A",

          item_name:
            "TECHNICAL ITEM",

          item_class_id:
            "DU",

          item_type_id:
            "TYPE-A",

          quantity:
            1,

          note:
            "",

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

          toppings:
            []
        }
      ]
    },

    ...overrides
  };

  return normalizeFabiC04EventV1(
    raw
  );
}

test(
  "construction requires trusted RPC adapter",
  () => {
    assert.throws(
      () =>
        createFabiC04InboxPersistenceAdapterV1(),
      /C04_PERSIST_RPC_ADAPTER_REQUIRED/
    );
  }
);

test(
  "construction performs no persistence call",
  () => {
    let calls = 0;

    createFabiC04InboxPersistenceAdapterV1({
      invokeRpc: async () => {
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
  "buildRpcArgs uses exact private RPC contract",
  () => {
    const event =
      normalizedEvent();

    const args =
      buildRpcArgs(
        event
      );

    assert.equal(
      args.p_source,
      "fabi_c04_sale_change_log"
    );

    assert.equal(
      args.p_schema_version,
      "cing_kds_fabi_c04_event_v1"
    );

    assert.equal(
      args.p_source_log_type,
      "SALE_CHANGE"
    );

    assert.equal(
      args.p_event_fingerprint,
      event.event_fingerprint
    );

    assert.equal(
      args.p_tran_id,
      "TRAN-63B"
    );

    assert.equal(
      args.p_normalized_event,
      event
    );
  }
);

test(
  "buildRpcArgs rejects missing branch scope before any RPC",
  () => {
    const event = normalizedEvent();

    for (const [field, code] of [
      ["source_store_uid", "C04_PERSIST_STORE_INVALID"],
      ["source_brand_uid", "C04_PERSIST_BRAND_INVALID"],
      ["source_company_uid", "C04_PERSIST_COMPANY_INVALID"]
    ]) {
      assert.throws(
        () =>
          buildRpcArgs({
            ...event,
            [field]: ""
          }),
        new RegExp(code)
      );
    }
  }
);

test(
  "persist calls only exact inbox RPC",
  async () => {
    let invocation = null;

    const adapter =
      createFabiC04InboxPersistenceAdapterV1({
        invokeRpc:
          async input => {
            invocation = input;

            return {
              result:
                "inserted",

              inbox_id:
                1,

              observation_count:
                1
            };
          }
      });

    await adapter.persist(
      normalizedEvent()
    );

    assert.equal(
      invocation.functionName,
      RPC_NAME
    );
  }
);

test(
  "inserted receipt is durable and accepted",
  async () => {
    const adapter =
      createFabiC04InboxPersistenceAdapterV1({
        invokeRpc:
          async () => ({
            result:
              "inserted",

            inbox_id:
              10,

            observation_count:
              1
          })
      });

    const receipt =
      await adapter.persist(
        normalizedEvent()
      );

    assert.deepEqual(
      receipt,
      {
        durable:
          true,

        accepted:
          true,

        review_required:
          false,

        result:
          "inserted",

        inbox_id:
          10,

        observation_count:
          1
      }
    );
  }
);

test(
  "exact durable duplicate is accepted safely",
  async () => {
    const adapter =
      createFabiC04InboxPersistenceAdapterV1({
        invokeRpc:
          async () => ({
            result:
              "duplicate",

            inbox_id:
              10,

            observation_count:
              2
          })
      });

    const receipt =
      await adapter.persist(
        normalizedEvent()
      );

    assert.equal(
      receipt.accepted,
      true
    );

    assert.equal(
      receipt.result,
      "duplicate"
    );

    assert.equal(
      receipt.observation_count,
      2
    );
  }
);

test(
  "fingerprint conflict is durable but never accepted",
  async () => {
    const adapter =
      createFabiC04InboxPersistenceAdapterV1({
        invokeRpc:
          async () => ({
            result:
              "conflict",

            inbox_id:
              10,

            observation_count:
              1
          })
      });

    const receipt =
      await adapter.persist(
        normalizedEvent()
      );

    assert.equal(
      receipt.durable,
      true
    );

    assert.equal(
      receipt.accepted,
      false
    );

    assert.equal(
      receipt.review_required,
      true
    );
  }
);

test(
  "unknown persistence outcome fails closed",
  async () => {
    const adapter =
      createFabiC04InboxPersistenceAdapterV1({
        invokeRpc:
          async () => {
            throw new Error(
              "network secret details"
            );
          }
      });

    await assert.rejects(
      adapter.persist(
        normalizedEvent()
      ),
      error => {
        assert.equal(
          error.code,
          "C04_PERSIST_OUTCOME_UNKNOWN"
        );

        assert.equal(
          error.message.includes(
            "network secret details"
          ),
          false
        );

        return true;
      }
    );
  }
);

test(
  "DB commit followed by lost response is not acknowledged",
  async () => {
    const durable =
      new Set();

    let first =
      true;

    const event =
      normalizedEvent();

    const adapter =
      createFabiC04InboxPersistenceAdapterV1({
        invokeRpc:
          async ({ args }) => {
            if (first) {
              first = false;

              /*
               * Simulate database commit.
               */
              durable.add(
                args.p_event_fingerprint
              );

              /*
               * Simulate response loss after commit.
               */
              throw new Error(
                "response lost"
              );
            }

            if (
              durable.has(
                args.p_event_fingerprint
              )
            ) {
              return {
                result:
                  "duplicate",

                inbox_id:
                  99,

                observation_count:
                  2
              };
            }

            throw new Error(
              "unexpected simulation state"
            );
          }
      });

    await assert.rejects(
      adapter.persist(event),
      /C04_PERSIST_OUTCOME_UNKNOWN/
    );

    assert.equal(
      durable.has(
        event.event_fingerprint
      ),
      true
    );
  }
);

test(
  "retry after lost response becomes safe durable duplicate",
  async () => {
    const durable =
      new Set();

    let call = 0;

    const event =
      normalizedEvent();

    const adapter =
      createFabiC04InboxPersistenceAdapterV1({
        invokeRpc:
          async ({ args }) => {
            call++;

            if (call === 1) {
              durable.add(
                args.p_event_fingerprint
              );

              throw new Error(
                "connection dropped after commit"
              );
            }

            assert.equal(
              durable.has(
                args.p_event_fingerprint
              ),
              true
            );

            return {
              result:
                "duplicate",

              inbox_id:
                101,

              observation_count:
                2
            };
          }
      });

    await assert.rejects(
      adapter.persist(event),
      /C04_PERSIST_OUTCOME_UNKNOWN/
    );

    const retry =
      await adapter.persist(
        event
      );

    assert.equal(
      retry.accepted,
      true
    );

    assert.equal(
      retry.result,
      "duplicate"
    );

    assert.equal(
      retry.inbox_id,
      101
    );
  }
);

test(
  "adapter awaits durable RPC result before returning accepted",
  async () => {
    let resolveRpc;

    const rpcPromise =
      new Promise(resolve => {
        resolveRpc =
          resolve;
      });

    const adapter =
      createFabiC04InboxPersistenceAdapterV1({
        invokeRpc:
          async () =>
            rpcPromise
      });

    let settled =
      false;

    const persistence =
      adapter
        .persist(
          normalizedEvent()
        )
        .then(value => {
          settled = true;
          return value;
        });

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          10
        )
    );

    assert.equal(
      settled,
      false
    );

    resolveRpc({
      result:
        "inserted",

      inbox_id:
        20,

      observation_count:
        1
    });

    const receipt =
      await persistence;

    assert.equal(
      settled,
      true
    );

    assert.equal(
      receipt.accepted,
      true
    );
  }
);

test(
  "malformed receipt cannot become accepted",
  async () => {
    const badReceipts = [
      null,
      {},
      {
        result:
          "unknown",
        inbox_id:
          1,
        observation_count:
          1
      },
      {
        result:
          "inserted",
        inbox_id:
          0,
        observation_count:
          1
      },
      {
        result:
          "duplicate",
        inbox_id:
          1,
        observation_count:
          0
      }
    ];

    for (
      const receipt
      of badReceipts
    ) {
      const adapter =
        createFabiC04InboxPersistenceAdapterV1({
          invokeRpc:
            async () =>
              receipt
        });

      await assert.rejects(
        adapter.persist(
          normalizedEvent()
        )
      );
    }
  }
);

test(
  "forged payment authority is rejected before RPC",
  async () => {
    let calls = 0;

    const event =
      normalizedEvent();

    const forged = {
      ...event,

      semantics: {
        ...event.semantics,

        payment_authority:
          true
      }
    };

    const adapter =
      createFabiC04InboxPersistenceAdapterV1({
        invokeRpc:
          async () => {
            calls++;

            return {
              result:
                "inserted",
              inbox_id:
                1,
              observation_count:
                1
            };
          }
      });

    await assert.rejects(
      adapter.persist(
        forged
      ),
      /C04_PERSIST_PAYMENT_AUTHORITY_FORBIDDEN/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "forged final-state authority is rejected before RPC",
  async () => {
    let calls = 0;

    const event =
      normalizedEvent();

    const forged = {
      ...event,

      semantics: {
        ...event.semantics,

        final_state_authority:
          true
      }
    };

    const adapter =
      createFabiC04InboxPersistenceAdapterV1({
        invokeRpc:
          async () => {
            calls++;

            return {
              result:
                "inserted",
              inbox_id:
                1,
              observation_count:
                1
            };
          }
      });

    await assert.rejects(
      adapter.persist(
        forged
      ),
      /C04_PERSIST_FINAL_AUTHORITY_FORBIDDEN/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "unexpected top-level fields are rejected to preserve normalized boundary",
  async () => {
    let calls = 0;

    const event =
      normalizedEvent();

    const forged = {
      ...event,

      customer_phone:
        "MUST_NOT_PERSIST"
    };

    const adapter =
      createFabiC04InboxPersistenceAdapterV1({
        invokeRpc:
          async () => {
            calls++;
          }
      });

    await assert.rejects(
      adapter.persist(
        forged
      ),
      /C04_PERSIST_EVENT_UNEXPECTED_FIELD/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "adapter exposes no payment or final-state verification behavior",
  () => {
    const source =
      require("node:fs")
        .readFileSync(
          require.resolve(
            "../cingKdsFabiC04InboxPersistenceAdapterV1"
          ),
          "utf8"
        );

    assert.doesNotMatch(
      source,
      /verifyPayment\s*\(/
    );

    assert.doesNotMatch(
      source,
      /markFinal\s*\(/
    );

    assert.doesNotMatch(
      source,
      /final_state_authority\s*:\s*true/
    );

    assert.doesNotMatch(
      source,
      /payment_authority\s*:\s*true/
    );
  }
);
