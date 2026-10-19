"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  ACQUIRE_RPC,
  COMMIT_RPC,
  RENEW_RPC,
  RELEASE_RPC,
  createFabiKdsRuntimeLeaseDbAdapterV1
} = require(
  "../cingKdsFabiRuntimeLeaseDbAdapterV1"
);

const SCOPE = {
  company_uid:
    "COMPANY",

  brand_uid:
    "BRAND",

  store_uid:
    "STORE"
};

function makeClient(
  handler
) {
  return {
    rpc:
      handler
  };
}

test(
  "exports exact four runtime RPC names",
  () => {
    assert.equal(
      ACQUIRE_RPC,
      "cing_kds_fabi_runtime_lease_acquire_v1"
    );

    assert.equal(
      COMMIT_RPC,
      "cing_kds_fabi_runtime_checkpoint_commit_v1"
    );

    assert.equal(
      RENEW_RPC,
      "cing_kds_fabi_runtime_lease_renew_v1"
    );

    assert.equal(
      RELEASE_RPC,
      "cing_kds_fabi_runtime_lease_release_v1"
    );
  }
);

test(
  "renew forwards exact fenced tuple and reports lease loss",
  async () => {
    const calls = [];

    const adapter =
      createFabiKdsRuntimeLeaseDbAdapterV1({
        supabase:
          makeClient(
            async (name, args) => {
              calls.push({name, args});

              return {
                data: [{
                  renewed: false,
                  lease_expires_at: null
                }],
                error: null
              };
            }
          )
      });

    const result =
      await adapter.renew({
        scope: SCOPE,
        lease_token: "TOKEN",
        lease_seconds: 120
      });

    assert.equal(calls[0].name, RENEW_RPC);
    assert.deepEqual(calls[0].args, {
      p_company_uid: "COMPANY",
      p_brand_uid: "BRAND",
      p_store_uid: "STORE",
      p_lease_token: "TOKEN",
      p_lease_seconds: 120
    });
    assert.deepEqual(result, {
      renewed: false,
      lease_expires_at: null
    });
  }
);

test(
  "construction performs no DB call",
  () => {
    let calls =
      0;

    createFabiKdsRuntimeLeaseDbAdapterV1({
      supabase:
        makeClient(
          async () => {
            calls++;
          }
        )
    });

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "acquire forwards exact branch tuple and lease duration",
  async () => {
    const calls = [];

    const adapter =
      createFabiKdsRuntimeLeaseDbAdapterV1({
        supabase:
          makeClient(
            async (
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
                    acquired:
                      true,

                    lease_token:
                      "11111111-1111-1111-1111-111111111111",

                    lease_expires_at:
                      "2026-10-16T05:00:00Z",

                    checkpoint_end_ms:
                      1234
                  }
                ],

                error:
                  null
              };
            }
          )
      });

    const result =
      await adapter.acquire({
        scope:
          SCOPE,

        lease_seconds:
          120
      });

    assert.equal(
      calls[0].name,
      ACQUIRE_RPC
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

        p_lease_seconds:
          120
      }
    );

    assert.equal(
      result.acquired,
      true
    );

    assert.equal(
      result.checkpoint_end_ms,
      1234
    );
  }
);

test(
  "busy branch never exposes foreign token",
  async () => {
    const adapter =
      createFabiKdsRuntimeLeaseDbAdapterV1({
        supabase:
          makeClient(
            async () => ({
              data: [
                {
                  acquired:
                    false,

                  lease_token:
                    null,

                  lease_expires_at:
                    "2026-10-16T05:00:00Z",

                  checkpoint_end_ms:
                    1000
                }
              ],

              error:
                null
            })
          )
      });

    const result =
      await adapter.acquire({
        scope:
          SCOPE,

        lease_seconds:
          120
      });

    assert.equal(
      result.acquired,
      false
    );

    assert.equal(
      result.lease_token,
      null
    );
  }
);

test(
  "foreign token exposure fails closed",
  async () => {
    const adapter =
      createFabiKdsRuntimeLeaseDbAdapterV1({
        supabase:
          makeClient(
            async () => ({
              data: [
                {
                  acquired:
                    false,

                  lease_token:
                    "foreign-token",

                  lease_expires_at:
                    null,

                  checkpoint_end_ms:
                    null
                }
              ],

              error:
                null
            })
          )
      });

    await assert.rejects(
      adapter.acquire({
        scope:
          SCOPE,

        lease_seconds:
          120
      }),
      /KDS_RUNTIME_FOREIGN_LEASE_TOKEN_EXPOSED/
    );
  }
);

test(
  "commit calls only exact fenced checkpoint RPC",
  async () => {
    const calls = [];

    const adapter =
      createFabiKdsRuntimeLeaseDbAdapterV1({
        supabase:
          makeClient(
            async (
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
                    committed:
                      true,

                    checkpoint_end_ms:
                      5000
                  }
                ],

                error:
                  null
              };
            }
          )
      });

    const result =
      await adapter.commit({
        scope:
          SCOPE,

        lease_token:
          "TOKEN",

        checkpoint_end_ms:
          5000
      });

    assert.equal(
      calls[0].name,
      COMMIT_RPC
    );

    assert.equal(
      calls[0]
        .args
        .p_lease_token,
      "TOKEN"
    );

    assert.equal(
      result.committed,
      true
    );
  }
);

test(
  "release calls exact token-fenced release RPC",
  async () => {
    let nameSeen =
      null;

    const adapter =
      createFabiKdsRuntimeLeaseDbAdapterV1({
        supabase:
          makeClient(
            async name => {
              nameSeen =
                name;

              return {
                data: [
                  {
                    released:
                      false
                  }
                ],

                error:
                  null
              };
            }
          )
      });

    const result =
      await adapter.release({
        scope:
          SCOPE,

        lease_token:
          "STALE"
      });

    assert.equal(
      nameSeen,
      RELEASE_RPC
    );

    assert.equal(
      result.released,
      false
    );
  }
);

test(
  "database errors are sanitized",
  async () => {
    const adapter =
      createFabiKdsRuntimeLeaseDbAdapterV1({
        supabase:
          makeClient(
            async () => ({
              data:
                null,

              error: {
                message:
                  "sensitive database text"
              }
            })
          )
      });

    await assert.rejects(
      adapter.acquire({
        scope:
          SCOPE,

        lease_seconds:
          120
      }),
      error => {
        assert.equal(
          error.message,
          "KDS_RUNTIME_LEASE_ACQUIRE_FAILED"
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
