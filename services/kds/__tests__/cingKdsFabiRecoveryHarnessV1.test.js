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

const SCOPE = Object.freeze({
  company_uid: "COMPANY",
  brand_uid: "BRAND",
  store_uid: "STORE"
});

const FP_A = "a".repeat(64);
const FP_B = "b".repeat(64);

test(
  "outage retry preserves exact durable transaction cardinality",
  async () => {
    const queue = new Map();
    const putCount = new Map();
    let pollAttempt = 0;
    let checkpointCommits = 0;
    let releaseCalls = 0;
    let retryOpen = false;

    const runner =
      createFabiKdsOneShotRunnerV1({
        scopeProvider:
          async () => SCOPE,

        nowProvider:
          async () => 2_000_000,

        windowPlanner:
          () => ({
            should_poll: retryOpen !== true,
            start_date: 1_900_000,
            end_date: 1_995_000,
            checkpoint_commit_ms: 1_995_000
          }),

        runtimeLeaseAdapter: {
          acquire:
            async ({lease_seconds}) => {
              assert.equal(lease_seconds, 120);
              return {
                acquired: true,
                lease_token: "LEASE",
                checkpoint_end_ms: 1_900_000
              };
            },

          renew:
            async ({lease_seconds}) => {
              assert.equal(lease_seconds, 120);
              return {
                renewed: true
              };
            },

          commit:
            async () => {
              checkpointCommits++;
              return {
                committed: true
              };
            },

          release:
            async () => {
              releaseCalls++;
              return {
                released: true
              };
            }
        },

        reconciliationQueueAdapter: {
          putResult:
            async result => {
              putCount.set(
                result.tran_id,
                (putCount.get(result.tran_id) || 0) + 1
              );

              queue.set(
                result.tran_id,
                {
                  ...result,
                  result_version: 1,
                  attempt_count: 0
                }
              );

              return {};
            },

          claimDue:
            async () => {
              if (retryOpen !== true) {
                return [];
              }

              const pending = queue.get("TRAN-A");

              return pending &&
                pending.status === "pending_c03"
                ? [
                    {
                      tran_id: "TRAN-A",
                      claim_token: "CLAIM-A",
                      result_version: 1,
                      state_fingerprint: FP_A,
                      attempt_count: 1
                    }
                  ]
                : [];
            },

          resolveClaim:
            async result => {
              queue.set(
                result.tran_id,
                {
                  ...queue.get(result.tran_id),
                  status: result.status,
                  state_fingerprint:
                    result.state_fingerprint,
                  retry_delay_seconds:
                    result.retry_delay_seconds
                }
              );

              return {};
            }
        },

        createPollRuntime:
          () => ({
            poll:
              async () => {
                pollAttempt++;

                if (pollAttempt === 1) {
                  const error =
                    new Error("C04_REQUEST_TIMEOUT");
                  error.code = "C04_REQUEST_TIMEOUT";
                  throw error;
                }

                return {
                  fetched_event_count: 2,
                  durable_event_count: 2,
                  transactions: [
                    {
                      tran_id: "TRAN-A",
                      status: "pending_c03",
                      state_fingerprint: FP_A
                    },
                    {
                      tran_id: "TRAN-B",
                      status: "ready",
                      state_fingerprint: FP_B
                    }
                  ]
                };
              },

            close: () => {}
          }),

        retryTransaction:
          async ({tran_id}) => {
            assert.equal(tran_id, "TRAN-A");

            return {
              status: "ready",
              state_fingerprint: FP_A
            };
          },

        branchLeaseSeconds: 120,
        retryLeaseSeconds: 120,
        retryBatchSize: 1
      });

    await assert.rejects(
      runner.runOnce(),
      /C04_REQUEST_TIMEOUT/
    );

    assert.equal(queue.size, 0);
    assert.equal(checkpointCommits, 0);
    assert.equal(releaseCalls, 1);

    const recovered =
      await runner.runOnce();

    assert.equal(recovered.checkpoint_committed, true);
    assert.equal(checkpointCommits, 1);
    assert.deepEqual(
      [...queue.keys()].sort(),
      ["TRAN-A", "TRAN-B"]
    );
    assert.equal(putCount.get("TRAN-A"), 1);
    assert.equal(putCount.get("TRAN-B"), 1);

    retryOpen = true;

    const retried =
      await runner.runOnce();

    assert.equal(retried.status, "caught_up");
    assert.equal(queue.size, 2);
    assert.equal(queue.get("TRAN-A").status, "ready");
    assert.equal(queue.get("TRAN-B").status, "ready");
    assert.equal(checkpointCommits, 1);
  }
);

test(
  "one 120-second lease owner rejects overlap while its poll is active",
  async () => {
    let releasePoll;
    let acquireCalls = 0;
    let renewCalls = 0;

    const gate = new Promise(resolve => {
      releasePoll = resolve;
    });

    const runner =
      createFabiKdsOneShotRunnerV1({
        scopeProvider:
          async () => SCOPE,

        nowProvider:
          async () => 2_000_000,

        windowPlanner:
          () => ({
            should_poll: true,
            start_date: 1_900_000,
            end_date: 1_995_000,
            checkpoint_commit_ms: 1_995_000
          }),

        runtimeLeaseAdapter: {
          acquire:
            async ({lease_seconds}) => {
              acquireCalls++;
              assert.equal(lease_seconds, 120);
              return {
                acquired: true,
                lease_token: "LEASE",
                checkpoint_end_ms: 1_900_000
              };
            },

          renew:
            async ({lease_seconds}) => {
              renewCalls++;
              assert.equal(lease_seconds, 120);
              return {renewed: true};
            },

          commit:
            async () => ({committed: true}),

          release:
            async () => ({released: true})
        },

        reconciliationQueueAdapter: {
          putResult:
            async () => ({}),
          claimDue:
            async () => [],
          resolveClaim:
            async () => ({})
        },

        createPollRuntime:
          () => ({
            poll:
              async () => {
                await gate;
                return {
                  fetched_event_count: 0,
                  durable_event_count: 0,
                  transactions: []
                };
              },
            close: () => {}
          }),

        retryTransaction:
          async () => ({
            status: "ready",
            state_fingerprint: FP_A
          }),

        branchLeaseSeconds: 120,
        retryLeaseSeconds: 120,
        retryBatchSize: 1
      });

    const first = runner.runOnce();

    await new Promise(
      resolve => setImmediate(resolve)
    );

    await assert.rejects(
      runner.runOnce(),
      /KDS_RUN_ALREADY_RUNNING/
    );

    assert.equal(acquireCalls, 1);

    releasePoll();
    await first;

    assert.ok(renewCalls >= 3);
  }
);
