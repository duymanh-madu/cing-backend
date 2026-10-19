"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const {
  PUT_RPC,
  LOAD_RPC,
  createFabiC04DurableDbAdapterV1
} = require(
  "../cingKdsFabiC04DurableDbAdapterV1"
);

const DB_MIG =
  "docs/kds/draft-migrations/r1-original/20261015090000_cing_kds_fabi_c04_event_inbox_v1.sql";

const SB_MIG =
  "docs/kds/draft-migrations/r1-original/20261015090000_cing_kds_fabi_c04_event_inbox_v1.sql";

function event(
  tranId = "TRAN-65A"
) {
  return {
    schema_version:
      "cing_kds_fabi_c04_event_v1",

    source:
      "fabi_c04_sale_change_log",

    source_log_type:
      "SALE_CHANGE",

    tran_id:
      tranId,

    tran_no:
      "650001",

    source_company_uid:
      "COMPANY",

    source_brand_uid:
      "BRAND",

    source_store_uid:
      "STORE",

    event_created_at:
      1000,

    event_updated_at:
      1000,

    event_fingerprint:
      "a".repeat(64),

    lines: [],

    semantics: {
      quantity_model:
        "signed_delta",

      payment_authority:
        false,

      final_state_authority:
        false,

      c03_final_reconciliation_required:
        true
    }
  };
}

function client({
  rpc
} = {}) {
  return {
    rpc:
      rpc ||
      (async () => ({
        data: [],
        error: null
      }))
  };
}

test(
  "exports exact private RPC names",
  () => {
    assert.equal(
      PUT_RPC,
      "cing_kds_fabi_c04_event_inbox_put_v1"
    );

    assert.equal(
      LOAD_RPC,
      "cing_kds_fabi_c04_event_inbox_load_tran_v1"
    );
  }
);

test(
  "construction requires RPC-capable Supabase client",
  () => {
    assert.throws(
      () =>
        createFabiC04DurableDbAdapterV1(),
      /C04_DB_RPC_CLIENT_REQUIRED/
    );
  }
);

test(
  "construction performs no database call",
  () => {
    let calls = 0;

    createFabiC04DurableDbAdapterV1({
      supabase:
        client({
          rpc:
            async () => {
              calls++;
            }
        })
    });

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "write adapter allows exact inbox put RPC only",
  async () => {
    const calls = [];

    const adapter =
      createFabiC04DurableDbAdapterV1({
        supabase:
          client({
            rpc:
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
                      result:
                        "inserted",

                      inbox_id:
                        1,

                      observation_count:
                        1
                    }
                  ],

                  error:
                    null
                };
              }
          })
      });

    const args = {
      p_source:
        "fabi_c04_sale_change_log"
    };

    const result =
      await adapter.invokeRpc({
        functionName:
          PUT_RPC,

        args
      });

    assert.equal(
      calls.length,
      1
    );

    assert.equal(
      calls[0].name,
      PUT_RPC
    );

    assert.equal(
      calls[0].args,
      args
    );

    assert.equal(
      result.result,
      "inserted"
    );
  }
);

test(
  "write adapter rejects arbitrary RPC execution",
  async () => {
    let calls = 0;

    const adapter =
      createFabiC04DurableDbAdapterV1({
        supabase:
          client({
            rpc:
              async () => {
                calls++;
              }
          })
      });

    await assert.rejects(
      adapter.invokeRpc({
        functionName:
          "some_other_rpc",

        args: {}
      }),
      /C04_DB_WRITE_RPC_FORBIDDEN/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "database write errors fail closed without leaking DB message",
  async () => {
    const adapter =
      createFabiC04DurableDbAdapterV1({
        supabase:
          client({
            rpc:
              async () => ({
                data:
                  null,

                error: {
                  message:
                    "sensitive database text"
                }
              })
          })
      });

    await assert.rejects(
      adapter.invokeRpc({
        functionName:
          PUT_RPC,

        args: {}
      }),
      error => {
        assert.equal(
          error.message,
          "C04_DB_WRITE_FAILED"
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
  "durable loader calls exact transaction-history RPC",
  async () => {
    const calls = [];

    const durableEvent =
      event();

    const adapter =
      createFabiC04DurableDbAdapterV1({
        supabase:
          client({
            rpc:
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
                      inbox_id:
                        1,

                      event_created_at:
                        1000,

                      normalized_event:
                        durableEvent
                    }
                  ],

                  error:
                    null
                };
              }
          })
      });

    const result =
      await adapter
        .loadDurableEvents({
          scope: {
            company_uid:
              "COMPANY",

            brand_uid:
              "BRAND",

            store_uid:
              "STORE"
          },

          tran_id:
            "TRAN-65A"
        });

    assert.equal(
      calls.length,
      1
    );

    assert.equal(
      calls[0].name,
      LOAD_RPC
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

        p_tran_id:
          "TRAN-65A"
      }
    );

    assert.equal(
      result.length,
      1
    );

    assert.equal(
      result[0],
      durableEvent
    );
  }
);

test(
  "durable loader preserves deterministic DB event order",
  async () => {
    const a =
      event();

    const b = {
      ...event(),

      event_fingerprint:
        "b".repeat(64),

      event_created_at:
        1001
    };

    const adapter =
      createFabiC04DurableDbAdapterV1({
        supabase:
          client({
            rpc:
              async () => ({
                data: [
                  {
                    inbox_id:
                      10,

                    event_created_at:
                      1000,

                    normalized_event:
                      a
                  },
                  {
                    inbox_id:
                      11,

                    event_created_at:
                      1001,

                    normalized_event:
                      b
                  }
                ],

                error:
                  null
              })
          })
      });

    const rows =
      await adapter
        .loadDurableEvents({
          scope: {
            company_uid:
              "COMPANY",

            brand_uid:
              "BRAND",

            store_uid:
              "STORE"
          },

          tran_id:
            "TRAN-65A"
        });

    assert.deepEqual(
      rows,
      [
        a,
        b
      ]
    );
  }
);

test(
  "loader rejects unstable event order",
  async () => {
    const adapter =
      createFabiC04DurableDbAdapterV1({
        supabase:
          client({
            rpc:
              async () => ({
                data: [
                  {
                    inbox_id:
                      2,

                    event_created_at:
                      1001,

                    normalized_event:
                      event()
                  },
                  {
                    inbox_id:
                      1,

                    event_created_at:
                      1000,

                    normalized_event:
                      event()
                  }
                ],

                error:
                  null
              })
          })
      });

    await assert.rejects(
      adapter.loadDurableEvents({
        scope: {
          company_uid:
            "COMPANY",

          brand_uid:
            "BRAND",

          store_uid:
            "STORE"
        },

        tran_id:
          "TRAN-65A"
      }),
      /C04_DB_LOAD_ORDER_INVALID/
    );
  }
);

test(
  "loader rejects foreign transaction event",
  async () => {
    const adapter =
      createFabiC04DurableDbAdapterV1({
        supabase:
          client({
            rpc:
              async () => ({
                data: [
                  {
                    inbox_id:
                      1,

                    event_created_at:
                      1000,

                    normalized_event:
                      event(
                        "FOREIGN-TRAN"
                      )
                  }
                ],

                error:
                  null
              })
          })
      });

    await assert.rejects(
      adapter.loadDurableEvents({
        scope: {
          company_uid:
            "COMPANY",

          brand_uid:
            "BRAND",

          store_uid:
            "STORE"
        },

        tran_id:
          "TRAN-65A"
      }),
      /C04_DB_DURABLE_EVENT_TRAN_MISMATCH/
    );
  }
);

test(
  "durable loader requires exact branch scope before RPC",
  async () => {
    let calls = 0;

    const adapter =
      createFabiC04DurableDbAdapterV1({
        supabase:
          client({
            rpc:
              async () => {
                calls++;
                return {
                  data: [],
                  error: null
                };
              }
          })
      });

    await assert.rejects(
      adapter.loadDurableEvents({
        tran_id:
          "TRAN-65A"
      }),
      /C04_DB_LOAD_SCOPE_REQUIRED/
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "loader rejects durable event from foreign branch",
  async () => {
    const foreign = {
      ...event(),
      source_store_uid:
        "OTHER-STORE"
    };

    const adapter =
      createFabiC04DurableDbAdapterV1({
        supabase:
          client({
            rpc:
              async () => ({
                data: [
                  {
                    inbox_id:
                      1,
                    event_created_at:
                      1000,
                    normalized_event:
                      foreign
                  }
                ],
                error:
                  null
              })
          })
      });

    await assert.rejects(
      adapter.loadDurableEvents({
        scope: {
          company_uid:
            "COMPANY",
          brand_uid:
            "BRAND",
          store_uid:
            "STORE"
        },
        tran_id:
          "TRAN-65A"
      }),
      /C04_DB_DURABLE_EVENT_SCOPE_MISMATCH/
    );
  }
);

test(
  "loader rejects forged payment authority",
  async () => {
    const forged = {
      ...event(),

      semantics: {
        ...event().semantics,

        payment_authority:
          true
      }
    };

    const adapter =
      createFabiC04DurableDbAdapterV1({
        supabase:
          client({
            rpc:
              async () => ({
                data: [
                  {
                    inbox_id:
                      1,

                    event_created_at:
                      1000,

                    normalized_event:
                      forged
                  }
                ],

                error:
                  null
              })
          })
      });

    await assert.rejects(
      adapter.loadDurableEvents({
        scope: {
          company_uid:
            "COMPANY",

          brand_uid:
            "BRAND",

          store_uid:
            "STORE"
        },

        tran_id:
          "TRAN-65A"
      }),
      /C04_DB_DURABLE_EVENT_AUTHORITY_INVALID/
    );
  }
);

test(
  "SQL mirrors are byte identical",
  () => {
    assert.equal(
      fs.readFileSync(
        DB_MIG,
        "utf8"
      ),
      fs.readFileSync(
        SB_MIG,
        "utf8"
      )
    );
  }
);

test(
  "service_role has no direct durable inbox table authority",
  () => {
    const sql =
      fs.readFileSync(
        DB_MIG,
        "utf8"
      );

    assert.match(
      sql,
      /revoke all[\s\S]*on table public\.cing_kds_fabi_c04_event_inbox[\s\S]*from service_role/i
    );
  }
);

test(
  "backend service_role may execute exact write RPC",
  () => {
    const sql =
      fs.readFileSync(
        DB_MIG,
        "utf8"
      );

    assert.match(
      sql,
      /grant execute[\s\S]*cing_kds_fabi_c04_event_inbox_put_v1[\s\S]*to service_role/i
    );
  }
);

test(
  "backend service_role may execute exact durable reload RPC",
  () => {
    const sql =
      fs.readFileSync(
        DB_MIG,
        "utf8"
      );

    assert.match(
      sql,
      /grant execute[\s\S]*cing_kds_fabi_c04_event_inbox_load_tran_v1\(\s*text,\s*text,\s*text,\s*text\s*\)[\s\S]*to service_role/i
    );
  }
);

test(
  "durable loader is SECURITY DEFINER with restricted search path",
  () => {
    const sql =
      fs.readFileSync(
        DB_MIG,
        "utf8"
      );

    assert.match(
      sql,
      /create or replace function public\.cing_kds_fabi_c04_event_inbox_load_tran_v1\([\s\S]*p_company_uid text,[\s\S]*p_brand_uid text,[\s\S]*p_store_uid text,[\s\S]*p_tran_id text[\s\S]*security definer[\s\S]*set search_path = public, pg_temp/i
    );
  }
);

test(
  "durable loader has deterministic transaction event ordering",
  () => {
    const sql =
      fs.readFileSync(
        DB_MIG,
        "utf8"
      );

    assert.match(
      sql,
      /where i\.source_company_uid = btrim\(p_company_uid\)[\s\S]*i\.source_brand_uid = btrim\(p_brand_uid\)[\s\S]*i\.source_store_uid = btrim\(p_store_uid\)[\s\S]*i\.tran_id = btrim\(p_tran_id\)[\s\S]*order by[\s\S]*i\.event_created_at asc[\s\S]*i\.id asc/i
    );
  }
);

test(
  "client roles cannot execute durable reload RPC",
  () => {
    const sql =
      fs.readFileSync(
        DB_MIG,
        "utf8"
      );

    for (
      const role
      of [
        "public",
        "anon",
        "authenticated"
      ]
    ) {
      assert.match(
        sql,
        new RegExp(
          `revoke all[\\s\\S]*cing_kds_fabi_c04_event_inbox_load_tran_v1\\(\\s*text,\\s*text,\\s*text,\\s*text\\s*\\)[\\s\\S]*from ${role}`,
          "i"
        )
      );
    }
  }
);
