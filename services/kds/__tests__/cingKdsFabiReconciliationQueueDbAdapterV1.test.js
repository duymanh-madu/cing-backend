"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  PUT_RPC,
  CLAIM_RPC,
  RESOLVE_RPC,
  createFabiKdsReconciliationQueueDbAdapterV1
} = require(
  "../cingKdsFabiReconciliationQueueDbAdapterV1"
);

const SCOPE = {
  company_uid:
    "COMPANY",
  brand_uid:
    "BRAND",
  store_uid:
    "STORE"
};

const FP =
  "a".repeat(64);

function client(
  handler
) {
  return {
    rpc:
      handler
  };
}

test(
  "exports exact three reconciliation RPC names",
  () => {
    assert.equal(
      PUT_RPC,
      "cing_kds_fabi_reconciliation_result_put_v1"
    );

    assert.equal(
      CLAIM_RPC,
      "cing_kds_fabi_reconciliation_claim_due_v1"
    );

    assert.equal(
      RESOLVE_RPC,
      "cing_kds_fabi_reconciliation_resolve_claim_v1"
    );
  }
);

test(
  "construction performs no DB call",
  () => {
    let calls = 0;

    createFabiKdsReconciliationQueueDbAdapterV1({
      supabase:
        client(async () => {
          calls++;
        })
    });

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "pending result is durably scheduled",
  async () => {
    const calls = [];

    const adapter =
      createFabiKdsReconciliationQueueDbAdapterV1({
        supabase:
          client(async (
            name,
            args
          ) => {
            calls.push({
              name,
              args
            });

            return {
              data: [
                {
                  reconciliation_status:
                    "pending_c03",
                  result_version:
                    1,
                  attempt_count:
                    0,
                  next_reconcile_at:
                    "2026-10-16T05:00:10Z"
                }
              ],
              error:
                null
            };
          })
      });

    const result =
      await adapter.putResult({
        scope:
          SCOPE,
        tran_id:
          "TRAN-1",
        status:
          "pending_c03",
        state_fingerprint:
          FP,
        retry_delay_seconds:
          10
      });

    assert.equal(
      calls[0].name,
      PUT_RPC
    );

    assert.equal(
      calls[0]
        .args
        .p_retry_delay_seconds,
      10
    );

    assert.equal(
      result.status,
      "pending_c03"
    );
  }
);

test(
  "terminal result forbids retry schedule",
  async () => {
    let calls = 0;

    const adapter =
      createFabiKdsReconciliationQueueDbAdapterV1({
        supabase:
          client(async () => {
            calls++;
          })
      });

    await assert.rejects(
      adapter.putResult({
        scope:
          SCOPE,
        tran_id:
          "TRAN-1",
        status:
          "ready",
        state_fingerprint:
          FP,
        retry_delay_seconds:
          10
      }),
      /KDS_RECON_TERMINAL_RETRY_FORBIDDEN/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "claim uses exact branch tuple and bounded batch lease",
  async () => {
    const calls = [];

    const adapter =
      createFabiKdsReconciliationQueueDbAdapterV1({
        supabase:
          client(async (
            name,
            args
          ) => {
            calls.push({
              name,
              args
            });

            return {
              data: [
                {
                  tran_id:
                    "TRAN-1",
                  claim_token:
                    "TOKEN-1",
                  result_version:
                    3,
                  state_fingerprint:
                    FP,
                  attempt_count:
                    2
                }
              ],
              error:
                null
            };
          })
      });

    const rows =
      await adapter.claimDue({
        scope:
          SCOPE,
        batch_size:
          20,
        lease_seconds:
          120
      });

    assert.equal(
      calls[0].name,
      CLAIM_RPC
    );

    assert.deepEqual(
      calls[0].args,
      {
        p_company_uid:
          "COMPANY",
        p_brand_uid:
          "BRAND",
        p_store_uid:
          "STORE",
        p_batch_size:
          20,
        p_lease_seconds:
          120
      }
    );

    assert.equal(
      rows[0].tran_id,
      "TRAN-1"
    );

    assert.equal(
      rows[0].result_version,
      3
    );
  }
);

test(
  "resolve forwards claim token and expected result version",
  async () => {
    let seen;

    const adapter =
      createFabiKdsReconciliationQueueDbAdapterV1({
        supabase:
          client(async (
            name,
            args
          ) => {
            seen = {
              name,
              args
            };

            return {
              data: [
                {
                  reconciliation_status:
                    "ready",
                  result_version:
                    4,
                  attempt_count:
                    2,
                  next_reconcile_at:
                    null
                }
              ],
              error:
                null
            };
          })
      });

    const result =
      await adapter.resolveClaim({
        scope:
          SCOPE,
        tran_id:
          "TRAN-1",
        claim_token:
          "TOKEN-1",
        expected_result_version:
          3,
        status:
          "ready",
        state_fingerprint:
          FP
      });

    assert.equal(
      seen.name,
      RESOLVE_RPC
    );

    assert.equal(
      seen.args
        .p_claim_token,
      "TOKEN-1"
    );

    assert.equal(
      seen.args
        .p_expected_result_version,
      3
    );

    assert.equal(
      result.status,
      "ready"
    );
  }
);

test(
  "invalid fingerprint fails before DB",
  async () => {
    let calls = 0;

    const adapter =
      createFabiKdsReconciliationQueueDbAdapterV1({
        supabase:
          client(async () => {
            calls++;
          })
      });

    await assert.rejects(
      adapter.putResult({
        scope:
          SCOPE,
        tran_id:
          "TRAN-1",
        status:
          "pending_c03",
        state_fingerprint:
          "bad",
        retry_delay_seconds:
          10
      }),
      /KDS_RECON_FINGERPRINT_INVALID/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "DB errors are sanitized",
  async () => {
    const adapter =
      createFabiKdsReconciliationQueueDbAdapterV1({
        supabase:
          client(async () => ({
            data:
              null,
            error: {
              message:
                "sensitive database detail"
            }
          }))
      });

    await assert.rejects(
      adapter.claimDue({
        scope:
          SCOPE,
        batch_size:
          10,
        lease_seconds:
          120
      }),
      error => {
        assert.equal(
          error.message,
          "KDS_RECON_CLAIM_FAILED"
        );

        assert.doesNotMatch(
          error.message,
          /sensitive/
        );

        return true;
      }
    );
  }
);

test(
  "opening-window delay accepts nine hours but rejects longer",
  async () => {
    let seen = null;

    const adapter =
      createFabiKdsReconciliationQueueDbAdapterV1({
        supabase:
          client(async (name, args) => {
            seen = {name, args};
            return {
              data: [
                {
                  reconciliation_status: "pending_c03",
                  result_version: 1,
                  attempt_count: 0,
                  next_reconcile_at: "future"
                }
              ],
              error: null
            };
          })
      });

    await adapter.putResult({
      scope: SCOPE,
      tran_id: "TRAN-1",
      status: "pending_c03",
      state_fingerprint: FP,
      retry_delay_seconds: 32_400
    });

    assert.equal(
      seen.args.p_retry_delay_seconds,
      32_400
    );

    await assert.rejects(
      adapter.putResult({
        scope: SCOPE,
        tran_id: "TRAN-1",
        status: "pending_c03",
        state_fingerprint: FP,
        retry_delay_seconds: 32_401
      }),
      /KDS_RECON_RETRY_DELAY_INVALID/
    );
  }
);
