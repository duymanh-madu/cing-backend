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
  createFabiC04IngestCoordinatorV1
} = require(
  "../cingKdsFabiC04IngestCoordinatorV1"
);

function rawEvent({
  tranId = "TRAN-A",
  tranNo = "100001",
  id = "SD-A",
  qty = 1,
  createdAt = 100
} = {}) {
  return {
    created_at:
      createdAt,

    updated_at:
      createdAt,

    tran_id:
      tranId,

    log_type:
      "SALE_CHANGE",

    change_data: {
      tran_id:
        tranId,

      tran_no:
        tranNo,

      company_uid:
        "COMPANY",

      brand_uid:
        "BRAND",

      store_uid:
        "STORE",

      sale_detail: [
        {
          id_sale_detail:
            id,

          item_id:
            "ITEM",

          item_name:
            "TECHNICAL ITEM",

          item_class_id:
            "DU",

          item_type_id:
            "TYPE",

          quantity:
            qty,

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
            1000,

          toppings: []
        }
      ]
    }
  };
}

function normalized(args = {}) {
  return normalizeFabiC04EventV1(
    rawEvent(args)
  );
}

function baseDeps(
  overrides = {}
) {
  const durable =
    new Map();

  const fetchEvents =
    async () => ({
      events: [
        rawEvent()
      ],
      next_cursor:
        "NEXT"
    });

  const persistenceAdapter = {
    persist:
      async event => {
        if (
          !durable.has(
            event.tran_id
          )
        ) {
          durable.set(
            event.tran_id,
            []
          );
        }

        const list =
          durable.get(
            event.tran_id
          );

        if (
          !list.some(
            existing =>
              existing
                .event_fingerprint ===
              event.event_fingerprint
          )
        ) {
          list.push(event);

          return {
            durable:
              true,
            accepted:
              true,
            review_required:
              false,
            result:
              "inserted",
            inbox_id:
              1,
            observation_count:
              1
          };
        }

        return {
          durable:
            true,
          accepted:
            true,
          review_required:
            false,
          result:
            "duplicate",
          inbox_id:
            1,
          observation_count:
            2
        };
      }
  };

  const loadDurableEvents =
    async ({ tran_id }) =>
      durable.get(tran_id) ||
      [];

  const reconcileWithC03 =
    async () => ({
      authority:
        "c03_paid_final",
      matched:
        true
    });

  return {
    durable,
    fetchEvents,
    persistenceAdapter,
    loadDurableEvents,
    reconcileWithC03,
    ...overrides
  };
}

test(
  "requires fetch adapter",
  () => {
    assert.throws(
      () =>
        createFabiC04IngestCoordinatorV1({
          persistenceAdapter: {
            persist:
              async () => {}
          },
          loadDurableEvents:
            async () => [],
          reconcileWithC03:
            async () => ({})
        }),
      /C04_INGEST_FETCH_ADAPTER_REQUIRED/
    );
  }
);

test(
  "requires persistence adapter",
  () => {
    assert.throws(
      () =>
        createFabiC04IngestCoordinatorV1({
          fetchEvents:
            async () => ({
              events: []
            }),
          loadDurableEvents:
            async () => [],
          reconcileWithC03:
            async () => ({})
        }),
      /C04_INGEST_PERSIST_ADAPTER_REQUIRED/
    );
  }
);

test(
  "requires durable reload adapter",
  () => {
    assert.throws(
      () =>
        createFabiC04IngestCoordinatorV1({
          fetchEvents:
            async () => ({
              events: []
            }),
          persistenceAdapter: {
            persist:
              async () => {}
          },
          reconcileWithC03:
            async () => ({})
        }),
      /C04_INGEST_DURABLE_LOADER_REQUIRED/
    );
  }
);

test(
  "requires C03 reconciler",
  () => {
    assert.throws(
      () =>
        createFabiC04IngestCoordinatorV1({
          fetchEvents:
            async () => ({
              events: []
            }),
          persistenceAdapter: {
            persist:
              async () => {}
          },
          loadDurableEvents:
            async () => []
        }),
      /C04_INGEST_C03_RECONCILER_REQUIRED/
    );
  }
);

test(
  "construction performs no I/O",
  () => {
    let calls = 0;

    createFabiC04IngestCoordinatorV1(
      baseDeps({
        fetchEvents:
          async () => {
            calls++;
            return {
              events: []
            };
          }
      })
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "empty fetch performs no persistence or reconciliation",
  async () => {
    let persistCalls = 0;
    let loadCalls = 0;
    let reconcileCalls = 0;

    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps({
          fetchEvents:
            async () => ({
              events: [],
              next_cursor:
                "EMPTY"
            }),

          persistenceAdapter: {
            persist:
              async () => {
                persistCalls++;
              }
          },

          loadDurableEvents:
            async () => {
              loadCalls++;
              return [];
            },

          reconcileWithC03:
            async () => {
              reconcileCalls++;
            }
        })
      );

    const result =
      await coordinator.poll();

    assert.equal(
      result.fetched_event_count,
      0
    );

    assert.equal(
      persistCalls,
      0
    );

    assert.equal(
      loadCalls,
      0
    );

    assert.equal(
      reconcileCalls,
      0
    );
  }
);

test(
  "durable persist completes before durable reload",
  async () => {
    const order = [];

    const event =
      normalized();

    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps({
          fetchEvents:
            async () => ({
              events: [
                rawEvent()
              ]
            }),

          persistenceAdapter: {
            persist:
              async () => {
                order.push(
                  "persist"
                );

                return {
                  durable:
                    true,
                  accepted:
                    true,
                  review_required:
                    false,
                  result:
                    "inserted",
                  inbox_id:
                    1,
                  observation_count:
                    1
                };
              }
          },

          loadDurableEvents:
            async () => {
              order.push(
                "load"
              );

              return [
                event
              ];
            },

          reconcileWithC03:
            async () => {
              order.push(
                "reconcile"
              );

              return {
                authority:
                  "c03_paid_final",
                matched:
                  true
              };
            }
        })
      );

    await coordinator.poll();

    assert.deepEqual(
      order,
      [
        "persist",
        "load",
        "reconcile"
      ]
    );
  }
);

test(
  "durable duplicate is accepted for downstream projection",
  async () => {
    const event =
      normalized();

    let loadCalls = 0;

    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps({
          persistenceAdapter: {
            persist:
              async () => ({
                durable:
                  true,
                accepted:
                  true,
                review_required:
                  false,
                result:
                  "duplicate",
                inbox_id:
                  1,
                observation_count:
                  2
              })
          },

          loadDurableEvents:
            async () => {
              loadCalls++;

              return [
                event
              ];
            }
        })
      );

    const result =
      await coordinator.poll();

    assert.equal(
      loadCalls,
      1
    );

    assert.equal(
      result.transactions[0]
        .ready,
      true
    );
  }
);

test(
  "durable conflict blocks projection for that transaction",
  async () => {
    let loadCalls = 0;
    let reconcileCalls = 0;

    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps({
          persistenceAdapter: {
            persist:
              async () => ({
                durable:
                  true,
                accepted:
                  false,
                review_required:
                  true,
                result:
                  "conflict",
                inbox_id:
                  1,
                observation_count:
                  1
              })
          },

          loadDurableEvents:
            async () => {
              loadCalls++;
              return [];
            },

          reconcileWithC03:
            async () => {
              reconcileCalls++;
            }
        })
      );

    const result =
      await coordinator.poll();

    assert.equal(
      loadCalls,
      0
    );

    assert.equal(
      reconcileCalls,
      0
    );

    assert.equal(
      result.transactions[0]
        .status,
      "review_required"
    );
  }
);

test(
  "unknown persistence outcome blocks reload reducer and C03",
  async () => {
    let loadCalls = 0;
    let reconcileCalls = 0;

    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps({
          persistenceAdapter: {
            persist:
              async () => {
                const error =
                  new Error(
                    "C04_PERSIST_OUTCOME_UNKNOWN"
                  );

                error.code =
                  "C04_PERSIST_OUTCOME_UNKNOWN";

                throw error;
              }
          },

          loadDurableEvents:
            async () => {
              loadCalls++;
              return [];
            },

          reconcileWithC03:
            async () => {
              reconcileCalls++;
            }
        })
      );

    await assert.rejects(
      coordinator.poll(),
      /C04_PERSIST_OUTCOME_UNKNOWN/
    );

    assert.equal(
      loadCalls,
      0
    );

    assert.equal(
      reconcileCalls,
      0
    );
  }
);

test(
  "crash mid-batch is safe to retry via durable duplicates",
  async () => {
    const durable =
      new Map();

    let firstAttempt =
      true;

    const rawA =
      rawEvent({
        id:
          "SD-A",
        createdAt:
          100
      });

    const rawB =
      rawEvent({
        id:
          "SD-B",
        createdAt:
          200
      });

    const persist =
      async event => {
        if (
          !durable.has(
            event.event_fingerprint
          )
        ) {
          durable.set(
            event.event_fingerprint,
            event
          );

          if (
            firstAttempt &&
            event.canonical_line_id ===
              "never"
          ) {
            throw new Error(
              "unreachable"
            );
          }

          if (
            firstAttempt &&
            durable.size === 2
          ) {
            const error =
              new Error(
                "C04_PERSIST_OUTCOME_UNKNOWN"
              );

            error.code =
              "C04_PERSIST_OUTCOME_UNKNOWN";

            throw error;
          }

          return {
            durable:
              true,
            accepted:
              true,
            review_required:
              false,
            result:
              "inserted",
            inbox_id:
              durable.size,
            observation_count:
              1
          };
        }

        return {
          durable:
            true,
          accepted:
            true,
          review_required:
            false,
          result:
            "duplicate",
          inbox_id:
            1,
          observation_count:
            2
        };
      };

    const load =
      async () =>
        [...durable.values()];

    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps({
          fetchEvents:
            async () => ({
              events:
                [rawA, rawB]
            }),

          persistenceAdapter: {
            persist
          },

          loadDurableEvents:
            load
        })
      );

    await assert.rejects(
      coordinator.poll(),
      /C04_PERSIST_OUTCOME_UNKNOWN/
    );

    assert.equal(
      durable.size,
      2
    );

    firstAttempt =
      false;

    const retry =
      await coordinator.poll();

    assert.equal(
      retry.transactions.length,
      1
    );

    assert.equal(
      retry.transactions[0]
        .ready,
      true
    );
  }
);

test(
  "reducer consumes durable reload rather than transient fetch batch",
  async () => {
    const durableOld =
      normalized({
        id:
          "SD-OLD",
        createdAt:
          50
      });

    const durableNew =
      normalized({
        id:
          "SD-NEW",
        createdAt:
          100
      });

    let projectedCount =
      null;

    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps({
          fetchEvents:
            async () => ({
              events: [
                rawEvent({
                  id:
                    "SD-NEW",
                  createdAt:
                    100
                })
              ]
            }),

          persistenceAdapter: {
            persist:
              async () => ({
                durable:
                  true,
                accepted:
                  true,
                review_required:
                  false,
                result:
                  "inserted",
                inbox_id:
                  2,
                observation_count:
                  1
              })
          },

          loadDurableEvents:
            async () => [
              durableOld,
              durableNew
            ],

          projectState:
            events => {
              projectedCount =
                events.length;

              return {
                tran_id:
                  "TRAN-A",
                state_fingerprint:
                  "STATE",
                active_line_count:
                  2,
                total_quantity:
                  2
              };
            }
        })
      );

    await coordinator.poll();

    assert.equal(
      projectedCount,
      2
    );
  }
);

test(
  "C03 matched final makes transaction ready",
  async () => {
    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps()
      );

    const result =
      await coordinator.poll();

    assert.equal(
      result.transactions[0]
        .status,
      "ready"
    );

    assert.equal(
      result.transactions[0]
        .ready,
      true
    );

    assert.equal(
      result.transactions[0]
        .reconciliation_authority,
      "c03_paid_final"
    );
  }
);

test(
  "C03 not final yet remains pending and not ready",
  async () => {
    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps({
          reconcileWithC03:
            async () => ({
              authority:
                "c03_paid_final",
              matched:
                false,
              status:
                "not_final_yet"
            })
        })
      );

    const result =
      await coordinator.poll();

    assert.equal(
      result.transactions[0]
        .status,
      "pending_c03"
    );

    assert.equal(
      result.transactions[0]
        .ready,
      false
    );

    assert.equal(
      result.transactions[0]
        .review_required,
      false
    );
  }
);

test(
  "C03 mismatch becomes review required",
  async () => {
    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps({
          reconcileWithC03:
            async () => ({
              authority:
                "c03_paid_final",
              matched:
                false,
              status:
                "mismatch"
            })
        })
      );

    const result =
      await coordinator.poll();

    assert.equal(
      result.transactions[0]
        .status,
      "review_required"
    );

    assert.equal(
      result.transactions[0]
        .ready,
      false
    );

    assert.equal(
      result.transactions[0]
        .review_required,
      true
    );
  }
);

test(
  "forged reconciliation authority fails closed",
  async () => {
    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps({
          reconcileWithC03:
            async () => ({
              authority:
                "c04",
              matched:
                true
            })
        })
      );

    await assert.rejects(
      coordinator.poll(),
      /C04_INGEST_RECONCILIATION_AUTHORITY_INVALID/
    );
  }
);

test(
  "concurrent poll is rejected",
  async () => {
    let release;

    const wait =
      new Promise(resolve => {
        release = resolve;
      });

    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps({
          fetchEvents:
            async () => {
              await wait;

              return {
                events: []
              };
            }
        })
      );

    const first =
      coordinator.poll();

    await assert.rejects(
      coordinator.poll(),
      /C04_INGEST_ALREADY_RUNNING/
    );

    release();

    await first;
  }
);

test(
  "coordinator can poll again after failure",
  async () => {
    let calls = 0;

    const deps =
      baseDeps({
        fetchEvents:
          async () => {
            calls++;

            if (calls === 1) {
              throw new Error(
                "temporary"
              );
            }

            return {
              events: []
            };
          }
      });

    const coordinator =
      createFabiC04IngestCoordinatorV1(
        deps
      );

    await assert.rejects(
      coordinator.poll(),
      /temporary/
    );

    const result =
      await coordinator.poll();

    assert.equal(
      result.fetched_event_count,
      0
    );
  }
);

test(
  "close blocks future polling",
  async () => {
    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps()
      );

    coordinator.close();

    assert.equal(
      coordinator.status()
        .closed,
      true
    );

    await assert.rejects(
      coordinator.poll(),
      /C04_INGEST_CLOSED/
    );
  }
);

test(
  "result does not expose raw customer PII",
  async () => {
    const raw =
      rawEvent();

    raw.change_data.extra_data = {
      customer_name:
        "PRIVATE NAME",
      customer_phone:
        "0000000000"
    };

    const deps =
      baseDeps({
        fetchEvents:
          async () => ({
            events: [
              raw
            ]
          })
      });

    const coordinator =
      createFabiC04IngestCoordinatorV1(
        deps
      );

    const result =
      await coordinator.poll();

    const serialized =
      JSON.stringify(result);

    assert.equal(
      serialized.includes(
        "PRIVATE NAME"
      ),
      false
    );

    assert.equal(
      serialized.includes(
        "0000000000"
      ),
      false
    );
  }
);

test(
  "closed-hours plan persists and queues pending state without C03",
  async () => {
    let c03Calls = 0;

    const coordinator =
      createFabiC04IngestCoordinatorV1(
        baseDeps({
          reconcileWithC03:
            async () => {
              c03Calls++;
              throw new Error(
                "C03 must stay deferred"
              );
            },

          c03Eligibility: {
            eligible: false,
            retry_delay_seconds: 32_400
          }
        })
      );

    const result =
      await coordinator.poll();

    assert.equal(c03Calls, 0);
    assert.equal(
      result.transactions[0].status,
      "pending_c03"
    );
    assert.equal(
      result.transactions[0].ready,
      false
    );
    assert.equal(
      result.transactions[0]
        .reconciliation_authority,
      "deferred_closed_hours"
    );
    assert.equal(
      result.transactions[0]
        .retry_delay_seconds,
      32_400
    );
  }
);
