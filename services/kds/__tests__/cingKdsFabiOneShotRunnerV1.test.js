"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  createFabiKdsOneShotRunnerV1
} = require(
  "../cingKdsFabiOneShotRunnerV1"
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

function base(
  overrides = {}
) {
  const order = [];

  const deps = {
    scopeProvider:
      async () => {
        order.push(
          "scope"
        );

        return SCOPE;
      },

    nowProvider:
      async () => {
        order.push(
          "now"
        );

        return 2_000_000;
      },

    runtimeLeaseAdapter: {
      acquire:
        async () => {
          order.push(
            "lease.acquire"
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
            `lease.commit:${checkpoint_end_ms}`
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
        async ({
          tran_id,
          status
        }) => {
          order.push(
            `queue.put:${tran_id}:${status}`
          );

          return {
            status,
            result_version:
              1,
            attempt_count:
              0,
            next_reconcile_at:
              status ===
                "pending_c03"
                ? "future"
                : null
          };
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
          order.push(
            "queue.resolve"
          );

          return {
            status:
              "ready",
            result_version:
              2,
            attempt_count:
              1,
            next_reconcile_at:
              null
          };
        }
    },

    createPollRuntime:
      () => {
        order.push(
          "runtime.create"
        );

        return {
          poll:
            async () => {
              order.push(
                "runtime.poll"
              );

              return {
                fetched_event_count:
                  1,

                durable_event_count:
                  1,

                transactions: [
                  {
                    tran_id:
                      "TRAN-1",

                    status:
                      "pending_c03",

                    ready:
                      false,

                    review_required:
                      false,

                    state_fingerprint:
                      FP
                  }
                ],

                /*
                 * Must never become commit authority.
                 */
                next_cursor:
                  999_999_999
              };
            },

          close:
            () => {
              order.push(
                "runtime.close"
              );
            }
        };
      },

    retryTransaction:
      async () => {
        order.push(
          "retry.transaction"
        );

        return {
          status:
            "ready",

          state_fingerprint:
            FP
        };
      },

    branchLeaseSeconds:
      120,

    overlapMs:
      60_000,

    settleLagMs:
      5_000,

    maxAdvanceMs:
      15 * 60_000,

    bootstrapLookbackMs:
      15 * 60_000,

    pendingRetryDelaySeconds:
      10,

    retryBatchSize:
      1,

    retryLeaseSeconds:
      120,

    ...overrides
  };

  return {
    deps,
    order
  };
}

test(
  "construction performs zero I/O",
  () => {
    const {
      deps,
      order
    } =
      base();

    const runner =
      createFabiKdsOneShotRunnerV1(
        deps
      );

    assert.deepEqual(
      order,
      []
    );

    assert.deepEqual(
      runner.status(),
      {
        running:
          false
      }
    );
  }
);

test(
  "retry claim batch is one so its token cannot expire behind a queue",
  () => {
    const {deps} =
      base({
        retryBatchSize: 2
      });

    assert.throws(
      () =>
        createFabiKdsOneShotRunnerV1(deps),
      /KDS_RUN_RETRY_BATCH_INVALID/
    );
  }
);

test(
  "busy branch exits before clock runtime queue or checkpoint",
  async () => {
    const {
      deps,
      order
    } =
      base({
        runtimeLeaseAdapter: {
          acquire:
            async () => {
              order.push(
                "lease.acquire"
              );

              return {
                acquired:
                  false,

                lease_token:
                  null,

                checkpoint_end_ms:
                  100
              };
            },

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
        }
      });

    const runner =
      createFabiKdsOneShotRunnerV1(
        deps
      );

    const result =
      await runner.runOnce();

    assert.equal(
      result.status,
      "lease_busy"
    );

    assert.deepEqual(
      order,
      [
        "scope",
        "lease.acquire"
      ]
    );
  }
);

test(
  "transaction queue persistence occurs before checkpoint commit",
  async () => {
    const {
      deps,
      order
    } =
      base();

    const runner =
      createFabiKdsOneShotRunnerV1(
        deps
      );

    const result =
      await runner.runOnce();

    assert.equal(
      result.status,
      "committed"
    );

    const put =
      order.indexOf(
        "queue.put:TRAN-1:pending_c03"
      );

    const claim =
      order.indexOf(
        "queue.claim"
      );

    const commit =
      order.findIndex(
        value =>
          value.startsWith(
            "lease.commit:"
          )
      );

    assert.ok(
      put >= 0
    );

    assert.ok(
      claim > put
    );

    assert.ok(
      commit > claim
    );
  }
);

test(
  "checkpoint uses planner safe end not runtime next_cursor",
  async () => {
    const {
      deps,
      order
    } =
      base();

    const runner =
      createFabiKdsOneShotRunnerV1(
        deps
      );

    const result =
      await runner.runOnce();

    /*
     * now 2,000,000
     * settle lag 5,000
     * checkpoint 1,900,000
     *
     * planned safe end = 1,995,000.
     */
    assert.equal(
      result.checkpoint_end_ms,
      1_995_000
    );

    assert.ok(
      order.includes(
        "lease.commit:1995000"
      )
    );

    assert.ok(
      !order.includes(
        "lease.commit:999999999"
      )
    );
  }
);

test(
  "missing state fingerprint blocks queue and checkpoint",
  async () => {
    const {
      deps,
      order
    } =
      base({
        createPollRuntime:
          () => ({
            poll:
              async () => {
                order.push(
                  "runtime.poll"
                );

                return {
                  fetched_event_count:
                    1,

                  durable_event_count:
                    0,

                  transactions: [
                    {
                      tran_id:
                        "TRAN-CONFLICT",

                      status:
                        "review_required",

                      ready:
                        false,

                      review_required:
                        true,

                      reason:
                        "durable_event_conflict"
                    }
                  ]
                };
              },

            close:
              () => {
                order.push(
                  "runtime.close"
                );
              }
          })
      });

    const runner =
      createFabiKdsOneShotRunnerV1(
        deps
      );

    await assert.rejects(
      runner.runOnce(),
      /KDS_RUN_STATE_FINGERPRINT_REQUIRED/
    );

    assert.ok(
      order.includes(
        "lease.release"
      )
    );

    assert.ok(
      !order.some(
        value =>
          value.startsWith(
            "queue.put:"
          )
      )
    );

    assert.ok(
      !order.some(
        value =>
          value.startsWith(
            "lease.commit:"
          )
      )
    );
  }
);

test(
  "queue write failure blocks checkpoint and releases branch lease",
  async () => {
    const {
      deps,
      order
    } =
      base();

    deps
      .reconciliationQueueAdapter
      .putResult =
      async () => {
        order.push(
          "queue.put.fail"
        );

        throw new Error(
          "QUEUE_WRITE_FAILED"
        );
      };

    const runner =
      createFabiKdsOneShotRunnerV1(
        deps
      );

    await assert.rejects(
      runner.runOnce(),
      /QUEUE_WRITE_FAILED/
    );

    assert.ok(
      order.includes(
        "lease.release"
      )
    );

    assert.ok(
      !order.some(
        value =>
          value.startsWith(
            "lease.commit:"
          )
      )
    );
  }
);

test(
  "due retry is resolved before checkpoint commit",
  async () => {
    const {
      deps,
      order
    } =
      base();

    deps
      .reconciliationQueueAdapter
      .claimDue =
      async () => {
        order.push(
          "queue.claim"
        );

        return [
          {
            tran_id:
              "OLD-TRAN",

            claim_token:
              "CLAIM",

            result_version:
              7,

            state_fingerprint:
              FP2,

            attempt_count:
              3
          }
        ];
      };

    deps.retryTransaction =
      async ({
        tran_id,
        state_fingerprint
      }) => {
        order.push(
          `retry.transaction:${tran_id}`
        );

        assert.equal(
          state_fingerprint,
          FP2
        );

        return {
          status:
            "ready",

          state_fingerprint:
            FP2
        };
      };

    deps
      .reconciliationQueueAdapter
      .resolveClaim =
      async ({
        tran_id,
        claim_token,
        expected_result_version,
        status
      }) => {
        order.push(
          `queue.resolve:${tran_id}`
        );

        assert.equal(
          claim_token,
          "CLAIM"
        );

        assert.equal(
          expected_result_version,
          7
        );

        assert.equal(
          status,
          "ready"
        );

        return {
          status:
            "ready",
          result_version:
            8,
          attempt_count:
            3,
          next_reconcile_at:
            null
        };
      };

    const runner =
      createFabiKdsOneShotRunnerV1(
        deps
      );

    const result =
      await runner.runOnce();

    assert.equal(
      result.retries_claimed,
      1
    );

    assert.equal(
      result.retries_resolved,
      1
    );

    const resolve =
      order.indexOf(
        "queue.resolve:OLD-TRAN"
      );

    const commit =
      order.findIndex(
        value =>
          value.startsWith(
            "lease.commit:"
          )
      );

    assert.ok(
      resolve >= 0
    );

    assert.ok(
      commit > resolve
    );
  }
);

test(
  "retry failure blocks checkpoint and releases branch lease",
  async () => {
    const {
      deps,
      order
    } =
      base();

    deps
      .reconciliationQueueAdapter
      .claimDue =
      async () => {
        order.push(
          "queue.claim"
        );

        return [
          {
            tran_id:
              "OLD-TRAN",

            claim_token:
              "CLAIM",

            result_version:
              1,

            state_fingerprint:
              FP,

            attempt_count:
              1
          }
        ];
      };

    deps.retryTransaction =
      async () => {
        order.push(
          "retry.fail"
        );

        throw new Error(
          "C03_TEMPORARY_FAILURE"
        );
      };

    const runner =
      createFabiKdsOneShotRunnerV1(
        deps
      );

    await assert.rejects(
      runner.runOnce(),
      /C03_TEMPORARY_FAILURE/
    );

    assert.ok(
      order.includes(
        "lease.release"
      )
    );

    assert.ok(
      !order.some(
        value =>
          value.startsWith(
            "lease.commit:"
          )
      )
    );
  }
);

test(
  "caught-up branch still processes durable retry queue",
  async () => {
    const {
      deps,
      order
    } =
      base({
        runtimeLeaseAdapter: {
          acquire:
            async () => {
              order.push(
                "lease.acquire"
              );

              return {
                acquired:
                  true,

                lease_token:
                  "LEASE",

                /*
                 * Ahead of safe end => caught up.
                 */
                checkpoint_end_ms:
                  2_100_000
              };
            },

          commit:
            async () => {
              throw new Error(
                "must not commit"
              );
            },

          renew:
            async () => ({
              renewed:
                true,
              lease_expires_at:
                "future"
            }),

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

        createPollRuntime:
          () => {
            throw new Error(
              "runtime must not be created"
            );
          }
      });

    const runner =
      createFabiKdsOneShotRunnerV1(
        deps
      );

    const result =
      await runner.runOnce();

    assert.equal(
      result.status,
      "caught_up"
    );

    assert.equal(
      result.polled,
      false
    );

    assert.ok(
      order.includes(
        "queue.claim"
      )
    );

    assert.ok(
      order.includes(
        "lease.release"
      )
    );

    assert.ok(
      !order.some(
        value =>
          value.startsWith(
            "lease.commit:"
          )
      )
    );
  }
);

test(
  "runtime poll failure releases branch lease and does not commit",
  async () => {
    const {
      deps,
      order
    } =
      base({
        createPollRuntime:
          () => ({
            poll:
              async () => {
                order.push(
                  "runtime.poll.fail"
                );

                throw new Error(
                  "FABi_DOWN"
                );
              },

            close:
              () => {
                order.push(
                  "runtime.close"
                );
              }
          })
      });

    const runner =
      createFabiKdsOneShotRunnerV1(
        deps
      );

    await assert.rejects(
      runner.runOnce(),
      /FABi_DOWN/
    );

    assert.ok(
      order.includes(
        "runtime.close"
      )
    );

    assert.ok(
      order.includes(
        "lease.release"
      )
    );

    assert.ok(
      !order.some(
        value =>
          value.startsWith(
            "lease.commit:"
          )
      )
    );
  }
);

test(
  "renewal denial stops future poll I/O and releases the owned lease",
  async () => {
    const {
      deps,
      order
    } =
      base({
        runtimeLeaseAdapter: {
          acquire:
            async () => ({
              acquired: true,
              lease_token: "LEASE",
              lease_expires_at: "future",
              checkpoint_end_ms: 1_900_000
            }),

          renew:
            async () => ({
              renewed: false,
              lease_expires_at: null
            }),

          commit:
            async () => {
              throw new Error("must not commit");
            },

          release:
            async () => {
              order.push("lease.release");
              return {released: true};
            }
        },

        createPollRuntime:
          () => {
            order.push("runtime.create");
            throw new Error("must not create runtime");
          }
      });

    const runner =
      createFabiKdsOneShotRunnerV1(deps);

    await assert.rejects(
      runner.runOnce(),
      /KDS_RUN_LEASE_RENEW_DENIED/
    );

    assert.deepEqual(order, [
      "scope",
      "now",
      "lease.release"
    ]);
  }
);

test(
  "pending retry resolution is rescheduled using configured delay",
  async () => {
    const {
      deps,
      order
    } =
      base();

    let resolveArgs =
      null;

    deps
      .reconciliationQueueAdapter
      .claimDue =
      async () => [
        {
          tran_id:
            "OLD-TRAN",

          claim_token:
            "CLAIM",

          result_version:
            2,

          state_fingerprint:
            FP2,

          attempt_count:
            2
        }
      ];

    deps.retryTransaction =
      async () => ({
        status:
          "pending_c03",

        state_fingerprint:
          FP2
      });

    deps
      .reconciliationQueueAdapter
      .resolveClaim =
      async args => {
        order.push(
          "queue.resolve"
        );

        resolveArgs =
          args;

        return {
          status:
            "pending_c03",

          result_version:
            3,

          attempt_count:
            2,

          next_reconcile_at:
            "future"
        };
      };

    const runner =
      createFabiKdsOneShotRunnerV1({
        ...deps,

        pendingRetryDelaySeconds:
          17
      });

    await runner.runOnce();

    assert.equal(
      resolveArgs
        .retry_delay_seconds,
      17
    );
  }
);

test(
  "review-required current transaction is durably terminal when fingerprint exists",
  async () => {
    const {
      deps
    } =
      base();

    let putArgs =
      null;

    deps.createPollRuntime =
      () => ({
        poll:
          async () => ({
            fetched_event_count:
              1,

            durable_event_count:
              1,

            transactions: [
              {
                tran_id:
                  "TRAN-MISMATCH",

                status:
                  "review_required",

                ready:
                  false,

                review_required:
                  true,

                state_fingerprint:
                  FP2
              }
            ]
          }),

        close:
          () => {}
      });

    deps
      .reconciliationQueueAdapter
      .putResult =
      async args => {
        putArgs =
          args;

        return {
          status:
            "review_required",

          result_version:
            1,

          attempt_count:
            0,

          next_reconcile_at:
            null
        };
      };

    const runner =
      createFabiKdsOneShotRunnerV1(
        deps
      );

    const result =
      await runner.runOnce();

    assert.equal(
      result.checkpoint_committed,
      true
    );

    assert.equal(
      putArgs.status,
      "review_required"
    );

    assert.equal(
      putArgs
        .retry_delay_seconds,
      null
    );
  }
);

test(
  "concurrent local run is rejected before second lease acquisition",
  async () => {
    let releaseFirst;

    const firstLease =
      new Promise(resolve => {
        releaseFirst =
          resolve;
      });

    let acquireCalls =
      0;

    const {
      deps
    } =
      base();

    deps
      .runtimeLeaseAdapter
      .acquire =
      async () => {
        acquireCalls++;

        await firstLease;

        return {
          acquired:
            false,

          lease_token:
            null,

          checkpoint_end_ms:
            null
        };
      };

    const runner =
      createFabiKdsOneShotRunnerV1(
        deps
      );

    const first =
      runner.runOnce();

    await new Promise(
      resolve =>
        setImmediate(resolve)
    );

    await assert.rejects(
      runner.runOnce(),
      /KDS_RUN_ALREADY_RUNNING/
    );

    assert.equal(
      acquireCalls,
      1
    );

    releaseFirst();

    await first;
  }
);

test(
  "runner exposes no scheduler or server lifecycle methods",
  () => {
    const {
      deps
    } =
      base();

    const runner =
      createFabiKdsOneShotRunnerV1(
        deps
      );

    assert.deepEqual(
      Object.keys(runner)
        .sort(),
      [
        "runOnce",
        "status"
      ]
    );

    assert.equal(
      runner.start,
      undefined
    );

    assert.equal(
      runner.stop,
      undefined
    );

    assert.equal(
      runner.listen,
      undefined
    );

    assert.equal(
      runner.mount,
      undefined
    );
  }
);

test(
  "closed-hours result receives exact opening retry delay",
  async () => {
    let runtimeEligibility = null;
    let putArgs = null;

    const {
      deps
    } = base({
      c03EligibilityProvider:
        async () => ({
          eligible: false,
          retry_delay_seconds: 32_400
        }),

      createPollRuntime:
        args => {
          runtimeEligibility =
            args.c03Eligibility;

          return {
            poll:
              async () => ({
                fetched_event_count: 1,
                durable_event_count: 1,
                transactions: [
                  {
                    tran_id: "TRAN-1",
                    status: "pending_c03",
                    state_fingerprint: FP,
                    retry_delay_seconds: 32_400
                  }
                ]
              }),
            close: () => {}
          };
        }
    });

    deps.reconciliationQueueAdapter.putResult =
      async args => {
        putArgs = args;
        return {};
      };

    const runner =
      createFabiKdsOneShotRunnerV1(deps);

    await runner.runOnce();

    assert.deepEqual(
      runtimeEligibility,
      {
        eligible: false,
        retry_delay_seconds: 32_400
      }
    );
    assert.equal(
      putArgs.retry_delay_seconds,
      32_400
    );
  }
);

test(
  "closed-hours retry is rescheduled without C03 work",
  async () => {
    let retryCalls = 0;
    let resolveArgs = null;

    const {
      deps
    } = base({
      windowPlanner:
        () => ({
          should_poll: false
        }),

      c03EligibilityProvider:
        async () => ({
          eligible: false,
          retry_delay_seconds: 32_400
        })
    });

    deps.reconciliationQueueAdapter.claimDue =
      async () => [
        {
          tran_id: "TRAN-1",
          claim_token: "CLAIM",
          result_version: 1,
          state_fingerprint: FP,
          attempt_count: 1
        }
      ];

    deps.reconciliationQueueAdapter.resolveClaim =
      async args => {
        resolveArgs = args;
        return {};
      };

    deps.retryTransaction = async () => {
      retryCalls++;
      throw new Error("C03 must stay deferred");
    };

    const runner =
      createFabiKdsOneShotRunnerV1(deps);

    const result = await runner.runOnce();

    assert.equal(result.status, "caught_up");
    assert.equal(retryCalls, 0);
    assert.equal(
      resolveArgs.retry_delay_seconds,
      32_400
    );
  }
);
