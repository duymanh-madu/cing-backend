"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  classifyRetryReconciliationV1,
  createFabiKdsRetryTransactionV1,
  createFabiKdsDormantRuntimeCompositionV1
} = require(
  "../cingKdsFabiDormantRuntimeCompositionV1"
);

const FP =
  "a".repeat(64);

const FP2 =
  "b".repeat(64);

const SCOPE = {
  company_uid:
    "COMPANY",

  brand_uid:
    "BRAND",

  store_uid:
    "STORE"
};

test(
  "retry classification mirrors current coordinator semantics",
  () => {
    assert.equal(
      classifyRetryReconciliationV1({
        authority:
          "c03_paid_final",

        matched:
          true,

        status:
          "matched"
      }),
      "ready"
    );

    assert.equal(
      classifyRetryReconciliationV1({
        authority:
          "c03_paid_final",

        matched:
          false,

        status:
          "not_final_yet"
      }),
      "pending_c03"
    );

    assert.equal(
      classifyRetryReconciliationV1({
        authority:
          "c03_paid_final",

        matched:
          false,

        status:
          "mismatch"
      }),
      "review_required"
    );
  }
);

test(
  "forged retry reconciliation authority fails closed",
  () => {
    assert.throws(
      () =>
        classifyRetryReconciliationV1({
          authority:
            "c04",

          matched:
            true
        }),
      /KDS_DORMANT_RECON_AUTHORITY_INVALID/
    );
  }
);

test(
  "retry loads exact branch and transaction",
  async () => {
    let seen =
      null;

    const retry =
      createFabiKdsRetryTransactionV1({
        loadDurableEvents:
          async args => {
            seen =
              args;

            return [
              {
                any:
                  "durable"
              }
            ];
          },

        projectState:
          () => ({
            tran_id:
              "TRAN-1",

            state_fingerprint:
              FP
          }),

        reconcileWithC03:
          async () => ({
            authority:
              "c03_paid_final",

            matched:
              true
          })
      });

    const result =
      await retry({
        scope:
          SCOPE,

        tran_id:
          "TRAN-1",

        state_fingerprint:
          FP
      });

    assert.deepEqual(
      seen,
      {
        scope:
          SCOPE,

        tran_id:
          "TRAN-1"
      }
    );

    assert.equal(
      result.status,
      "ready"
    );
  }
);

test(
  "retry rebuilds state from durable history before C03",
  async () => {
    const order = [];

    const retry =
      createFabiKdsRetryTransactionV1({
        loadDurableEvents:
          async () => {
            order.push(
              "durable.load"
            );

            return [
              {
                durable:
                  true
              }
            ];
          },

        projectState:
          history => {
            order.push(
              "state.project"
            );

            assert.equal(
              history[0].durable,
              true
            );

            return {
              tran_id:
                "TRAN-1",

              state_fingerprint:
                FP
            };
          },

        reconcileWithC03:
          async ({
            state
          }) => {
            order.push(
              "c03.reconcile"
            );

            assert.equal(
              state.state_fingerprint,
              FP
            );

            return {
              authority:
                "c03_paid_final",

              matched:
                false,

              status:
                "not_final_yet"
            };
          }
      });

    const result =
      await retry({
        scope:
          SCOPE,

        tran_id:
          "TRAN-1",

        state_fingerprint:
          FP
      });

    assert.deepEqual(
      order,
      [
        "durable.load",
        "state.project",
        "c03.reconcile"
      ]
    );

    assert.equal(
      result.status,
      "pending_c03"
    );
  }
);

test(
  "retry rejects empty durable history",
  async () => {
    const retry =
      createFabiKdsRetryTransactionV1({
        loadDurableEvents:
          async () => [],

        projectState:
          () => {
            throw new Error(
              "must not project"
            );
          },

        reconcileWithC03:
          async () => {
            throw new Error(
              "must not reconcile"
            );
          }
      });

    await assert.rejects(
      retry({
        scope:
          SCOPE,

        tran_id:
          "TRAN-1",

        state_fingerprint:
          FP
      }),
      /KDS_DORMANT_RETRY_HISTORY_EMPTY/
    );
  }
);

test(
  "changed durable state invalidates stale retry claim before C03",
  async () => {
    let c03Calls =
      0;

    const retry =
      createFabiKdsRetryTransactionV1({
        loadDurableEvents:
          async () => [
            {
              durable:
                true
            }
          ],

        projectState:
          () => ({
            tran_id:
              "TRAN-1",

            state_fingerprint:
              FP2
          }),

        reconcileWithC03:
          async () => {
            c03Calls++;

            return {
              authority:
                "c03_paid_final",

              matched:
                true
            };
          }
      });

    await assert.rejects(
      retry({
        scope:
          SCOPE,

        tran_id:
          "TRAN-1",

        state_fingerprint:
          FP
      }),
      /KDS_DORMANT_RETRY_STATE_CHANGED/
    );

    assert.equal(
      c03Calls,
      0
    );
  }
);

test(
  "retry mismatch becomes review_required",
  async () => {
    const retry =
      createFabiKdsRetryTransactionV1({
        loadDurableEvents:
          async () => [
            {
              durable:
                true
            }
          ],

        projectState:
          () => ({
            tran_id:
              "TRAN-1",

            state_fingerprint:
              FP
          }),

        reconcileWithC03:
          async () => ({
            authority:
              "c03_paid_final",

            matched:
              false,

            status:
              "mismatch"
          })
      });

    const result =
      await retry({
        scope:
          SCOPE,

        tran_id:
          "TRAN-1",

        state_fingerprint:
          FP
      });

    assert.deepEqual(
      result,
      {
        status:
          "review_required",

        state_fingerprint:
          FP
      }
    );
  }
);

test(
  "dormant composition construction performs zero I/O",
  () => {
    let calls =
      0;

    const runtime =
      createFabiKdsDormantRuntimeCompositionV1({
        scopeProvider:
          async () => {
            calls++;

            return SCOPE;
          },

        nowProvider:
          async () => {
            calls++;

            return 1;
          },

        c04HttpClient: {
          getSaleChangeLog:
            async () => {
              calls++;

              return {
                rows: [],
                page: 1
              };
            }
        },

        c03HttpClient: {
          getSaleDetail:
            async () => {
              calls++;

              return {};
            }
        },

        durableDbAdapter: {
          invokeRpc:
            async () => {
              calls++;
            },

          loadDurableEvents:
            async () => {
              calls++;

              return [];
            }
        },

        runtimeLeaseAdapter: {
          acquire:
            async () => {
              calls++;
            },

          renew:
            async () => {
              calls++;
            },

          commit:
            async () => {
              calls++;
            },

          release:
            async () => {
              calls++;
            }
        },

        reconciliationQueueAdapter: {
          putResult:
            async () => {
              calls++;
            },

          claimDue:
            async () => {
              calls++;
            },

          resolveClaim:
            async () => {
              calls++;
            }
        }
      });

    assert.equal(
      calls,
      0
    );

    assert.deepEqual(
      runtime.status(),
      {
        running:
          false
      }
    );
  }
);

test(
  "real dormant composition executes empty C04 poll then fenced checkpoint",
  async () => {
    const order = [];

    const runtime =
      createFabiKdsDormantRuntimeCompositionV1({
        scopeProvider:
          async () =>
            SCOPE,

        nowProvider:
          async () =>
            2_000_000,

        c04HttpClient: {
          getSaleChangeLog:
            async args => {
              order.push(
                "c04.http"
              );

              assert.equal(
                args.company_uid,
                "COMPANY"
              );

              assert.equal(
                args.brand_uid,
                "BRAND"
              );

              assert.equal(
                args.store_uid,
                "STORE"
              );

              return {
                rows: [],
                page:
                  args.page
              };
            }
        },

        c03HttpClient: {
          getSaleDetail:
            async () => {
              throw new Error(
                "empty C04 poll must not call C03"
              );
            }
        },

        c03WindowProvider:
          async () => ({
            start_date:
              0,

            end_date:
              2_000_000
          }),

        durableDbAdapter: {
          invokeRpc:
            async () => {
              throw new Error(
                "empty C04 poll must not persist"
              );
            },

          loadDurableEvents:
            async () => {
              throw new Error(
                "empty C04 poll must not reload"
              );
            }
        },

        runtimeLeaseAdapter: {
          acquire:
            async ({
              scope
            }) => {
              order.push(
                "lease.acquire"
              );

              assert.deepEqual(
                scope,
                SCOPE
              );

              return {
                acquired:
                  true,

                lease_token:
                  "LEASE",

                lease_expires_at:
                  "future",

                checkpoint_end_ms:
                  1_900_000
              };
            },

          commit:
            async ({
              checkpoint_end_ms
            }) => {
              order.push(
                "lease.commit"
              );

              assert.equal(
                checkpoint_end_ms,
                1_995_000
              );

              return {
                committed:
                  true,

                checkpoint_end_ms
              };
            },

          renew:
            async () => {
              order.push(
                "lease.renew"
              );

              return {
                renewed:
                  true,
                lease_expires_at:
                  "future"
              };
            },

          release:
            async () => {
              order.push(
                "lease.release"
              );

              return {
                released:
                  true
              };
            }
        },

        reconciliationQueueAdapter: {
          putResult:
            async () => {
              throw new Error(
                "empty C04 poll has no result"
              );
            },

          claimDue:
            async () => {
              order.push(
                "queue.claim"
              );

              return [];
            },

          resolveClaim:
            async () => {
              throw new Error(
                "no retry claim"
              );
            }
        }
      });

    const result =
      await runtime.runOnce();

    assert.equal(
      result.status,
      "committed"
    );

    assert.equal(
      result.checkpoint_committed,
      true
    );

    assert.ok(
      order.indexOf(
        "lease.acquire"
      ) <
      order.indexOf(
        "c04.http"
      )
    );

    assert.ok(
      order.indexOf(
        "c04.http"
      ) <
      order.indexOf(
        "queue.claim"
      )
    );

    assert.ok(
      order.indexOf(
        "queue.claim"
      ) <
      order.indexOf(
        "lease.commit"
      )
    );
  }
);

test(
  "busy branch performs no FABi HTTP",
  async () => {
    let httpCalls =
      0;

    const runtime =
      createFabiKdsDormantRuntimeCompositionV1({
        scopeProvider:
          async () =>
            SCOPE,

        nowProvider:
          async () =>
            2_000_000,

        c04HttpClient: {
          getSaleChangeLog:
            async () => {
              httpCalls++;

              return {
                rows: [],
                page: 1
              };
            }
        },

        c03HttpClient: {
          getSaleDetail:
            async () => {
              httpCalls++;

              return {};
            }
        },

        c03WindowProvider:
          async () => ({
            start_date:
              0,
            end_date:
              1
          }),

        durableDbAdapter: {
          invokeRpc:
            async () => {},
          loadDurableEvents:
            async () => []
        },

        runtimeLeaseAdapter: {
          acquire:
            async () => ({
              acquired:
                false,

              lease_token:
                null,

              checkpoint_end_ms:
                null
            }),

          commit:
            async () => {
              throw new Error(
                "must not commit"
              );
            },

          renew:
            async () => {
              throw new Error(
                "must not renew foreign lease"
              );
            },

          release:
            async () => {
              throw new Error(
                "must not release foreign lease"
              );
            }
        },

        reconciliationQueueAdapter: {
          putResult:
            async () => {},
          claimDue:
            async () => [],
          resolveClaim:
            async () => {}
        }
      });

    const result =
      await runtime.runOnce();

    assert.equal(
      result.status,
      "lease_busy"
    );

    assert.equal(
      httpCalls,
      0
    );
  }
);

test(
  "public dormant surface exposes only runOnce and status",
  () => {
    const runtime =
      createFabiKdsDormantRuntimeCompositionV1({
        scopeProvider:
          async () =>
            SCOPE,

        nowProvider:
          async () =>
            1,

        c04HttpClient: {
          getSaleChangeLog:
            async () => ({
              rows: [],
              page: 1
            })
        },

        c03HttpClient: {
          getSaleDetail:
            async () => ({})
        },

        c03WindowProvider:
          async () => ({
            start_date:
              0,
            end_date:
              1
          }),

        durableDbAdapter: {
          invokeRpc:
            async () => {},
          loadDurableEvents:
            async () => []
        },

        runtimeLeaseAdapter: {
          acquire:
            async () => ({
              acquired:
                false
            }),
          renew:
            async () => ({
              renewed:
                true,
              lease_expires_at:
                "future"
            }),
          commit:
            async () => {},
          release:
            async () => {}
        },

        reconciliationQueueAdapter: {
          putResult:
            async () => {},
          claimDue:
            async () => [],
          resolveClaim:
            async () => {}
        }
      });

    assert.deepEqual(
      Object.keys(runtime)
        .sort(),
      [
        "runOnce",
        "status"
      ]
    );

    assert.equal(
      runtime.start,
      undefined
    );

    assert.equal(
      runtime.stop,
      undefined
    );

    assert.equal(
      runtime.mount,
      undefined
    );

    assert.equal(
      runtime.listen,
      undefined
    );
  }
);
