"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const express = require("express");
const jwt = require("jsonwebtoken");

test(
  "Super Admin Revive Credit HTTP security",
  async (t) => {
    const root = path.resolve(
      __dirname,
      "../../../.."
    );

    const secret =
      "cing-revive-admin-local-security-test-only";

    const paths = {
      supabase: require.resolve(
        path.join(root, "supabase")
      ),

      jwtAuthority: require.resolve(
        path.join(
          root,
          "utils/jwtSecretAuthority"
        )
      ),

      middleware: require.resolve(
        path.join(
          root,
          "middlewares/adminPanelPermissionMiddleware"
        )
      ),

      adminRoleService: require.resolve(
        path.join(
          root,
          "services/adminRoleService"
        )
      ),

      service: require.resolve(
        path.join(
          root,
          "services/games/revival/cingReviveCreditAdminAdjustmentService"
        )
      ),

      route: require.resolve(
        path.join(
          root,
          "routes/adminReviveCreditRoutes"
        )
      ),
    };

    const previous = new Map(
      Object.values(paths).map(
        (filename) => [
          filename,
          require.cache[filename],
        ]
      )
    );

    const admins = new Map([
      [
        "1",
        {
          id: 1,
          username: "fixture-super-admin",
          role: "super_admin",
          active: true,
        },
      ],

      [
        "2",
        {
          id: 2,
          username: "fixture-manager",
          role: "manager",
          active: true,
        },
      ],

      [
        "3",
        {
          id: 3,
          username: "fixture-inactive",
          role: "super_admin",
          active: false,
        },
      ],
    ]);

    const rpcCalls = [];
    const adminLookups = [];
    const completed = new Map();

    let server;

    function mockModule(
      filename,
      exports
    ) {
      const fake = new Module(
        filename
      );

      fake.filename =
        filename;

      fake.loaded =
        true;

      fake.exports =
        exports;

      require.cache[filename] =
        fake;
    }

    function tokenFor(
      id,
      role = "super_admin"
    ) {
      return jwt.sign(
        {
          id,
          role,
          username:
            "untrusted-jwt-username",
        },
        secret,
        {
          expiresIn: "5m",
        }
      );
    }

    const baseBody = {
      user_id:
        "fixture-customer",

      amount:
        5,

      request_id:
        "10000000-0000-4000-8000-000000000001",

      reason_code:
        "customer_support",

      note:
        "Bù quyền lợi game sau đối soát",

      reference_type:
        "support_case",

      reference_id:
        "CASE-001",
    };

    function makeAdminsQuery() {
      let id = null;
      let activeOnly = false;

      const query = {
        select(columns) {
          assert.equal(
            columns,
            "id, username, role, active"
          );

          return query;
        },

        eq(column, value) {
          if (column === "id") {
            id = String(value);
          }

          if (
            column === "active" &&
            value === true
          ) {
            activeOnly = true;
          }

          return query;
        },

        async maybeSingle() {
          adminLookups.push({
            id,
            activeOnly,
          });

          const admin =
            admins.get(id) || null;

          return {
            data:
              admin &&
              (
                !activeOnly ||
                admin.active
              )
                ? admin
                : null,

            error: null,
          };
        },
      };

      return query;
    }

    const fakeSupabase = {
      from(table) {
        assert.equal(
          table,
          "admins"
        );

        return makeAdminsQuery();
      },

      async rpc(name, args) {
        rpcCalls.push({
          name,
          args,
        });

        assert.equal(
          name,
          "cing_revive_credit_admin_adjust_v1"
        );

        const key =
          String(args.p_user_id) +
          ":" +
          String(args.p_request_id);

        const previousResult =
          completed.get(key);

        if (previousResult) {
          if (
            JSON.stringify(
              previousResult.args
            ) !==
            JSON.stringify(args)
          ) {
            return {
              data: null,

              error: {
                code: "23505",
                message:
                  "REVIVE_REFERENCE_CONFLICT",
              },
            };
          }

          return {
            data: [
              {
                applied: false,

                transaction_id:
                  previousResult.transactionId,

                balance_after: 5,
              },
            ],

            error: null,
          };
        }

        const transactionId =
          String(
            completed.size + 1
          );

        completed.set(key, {
          args,
          transactionId,
        });

        return {
          data: [
            {
              applied: true,

              transaction_id:
                transactionId,

              balance_after: 5,
            },
          ],

          error: null,
        };
      },
    };

    async function request({
      token = null,
      body = baseBody,
    } = {}) {
      const headers = {
        "content-type":
          "application/json",
      };

      if (token) {
        headers.authorization =
          "Bearer " + token;
      }

      const response =
        await fetch(
          "http://127.0.0.1:" +
          server.address().port +
          "/api/admin/revive-credits/adjust",
          {
            method: "POST",

            headers,

            body:
              JSON.stringify(body),
          }
        );

      return {
        status:
          response.status,

        json:
          await response.json(),
      };
    }

    async function expectDenied({
      token,
      body,
      status,
      code,
    }) {
      const before =
        rpcCalls.length;

      const result =
        await request({
          token,
          body,
        });

      assert.equal(
        result.status,
        status
      );

      if (code) {
        assert.equal(
          result.json.code,
          code
        );
      }

      assert.equal(
        rpcCalls.length,
        before,
        "Denied request must not reach Revive Credit RPC"
      );

      return result;
    }

    try {
      mockModule(
        paths.supabase,
        fakeSupabase
      );

      mockModule(
        paths.jwtAuthority,
        {
          JWT_SECRET: secret,
        }
      );

      delete require.cache[
        paths.adminRoleService
      ];

      delete require.cache[
        paths.middleware
      ];

      delete require.cache[
        paths.service
      ];

      delete require.cache[
        paths.route
      ];

      const route =
        require(
          paths.route
        );

      const app =
        express();

      app.use(
        express.json()
      );

      app.use(
        "/api/admin/revive-credits",
        route
      );

      server =
        await new Promise(
          (resolve, reject) => {
            const instance =
              app.listen(
                0,
                "127.0.0.1",
                () => resolve(
                  instance
                )
              );

            instance.once(
              "error",
              reject
            );
          }
        );

      await t.test(
        "missing JWT returns 401",
        async () => {
          await expectDenied({
            status: 401,
          });
        }
      );

      await t.test(
        "invalid JWT returns 401",
        async () => {
          await expectDenied({
            token:
              "invalid.jwt.token",

            status: 401,
          });
        }
      );

      await t.test(
        "normal Admin returns 403",
        async () => {
          await expectDenied({
            token:
              tokenFor(
                2,
                "super_admin"
              ),

            status: 403,
          });
        }
      );

      await t.test(
        "inactive Super Admin returns 403",
        async () => {
          await expectDenied({
            token:
              tokenFor(3),

            status: 403,
          });
        }
      );

      await t.test(
        "unknown Admin returns 403",
        async () => {
          await expectDenied({
            token:
              tokenFor(999),

            status: 403,
          });
        }
      );

      await t.test(
        "forged actor body rejected",
        async () => {
          await expectDenied({
            token:
              tokenFor(1),

            body: {
              ...baseBody,

              actor_id:
                "999",
            },

            status: 400,

            code:
              "REVIVE_ADMIN_BODY_INVALID",
          });
        }
      );

      await t.test(
        "missing reason rejected",
        async () => {
          await expectDenied({
            token:
              tokenFor(1),

            body: {
              ...baseBody,

              reason_code:
                "",
            },

            status: 400,

            code:
              "REVIVE_ADMIN_REASON_CODE_INVALID",
          });
        }
      );

      await t.test(
        "invalid amount rejected",
        async () => {
          await expectDenied({
            token:
              tokenFor(1),

            body: {
              ...baseBody,

              amount:
                0,
            },

            status: 400,

            code:
              "REVIVE_ADMIN_AMOUNT_INVALID",
          });
        }
      );

      await t.test(
        "valid request uses database actor",
        async () => {
          const result =
            await request({
              token:
                tokenFor(
                  1,
                  "cashier"
                ),
            });

          assert.equal(
            result.status,
            200
          );

          assert.equal(
            result.json.success,
            true
          );

          assert.equal(
            result.json.data.applied,
            true
          );

          assert.equal(
            rpcCalls.length,
            1
          );

          assert.equal(
            rpcCalls[0].args
              .p_actor_admin_id,
            "1"
          );

          assert.equal(
            rpcCalls[0].args
              .p_user_id,
            "fixture-customer"
          );

          assert.equal(
            rpcCalls[0].args
              .p_amount,
            5
          );

          assert.ok(
            adminLookups.some(
              (lookup) =>
                lookup.id === "1" &&
                lookup.activeOnly
            )
          );
        }
      );

      await t.test(
        "exact HTTP retry does not reapply",
        async () => {
          const result =
            await request({
              token:
                tokenFor(1),
            });

          assert.equal(
            result.status,
            200
          );

          assert.equal(
            result.json.data.applied,
            false
          );

          assert.equal(
            result.json.data
              .transaction_id,
            "1"
          );
        }
      );

      await t.test(
        "changed request UUID replay returns 409",
        async () => {
          const result =
            await request({
              token:
                tokenFor(1),

              body: {
                ...baseBody,

                note:
                  "Changed adjustment note",
              },
            });

          assert.equal(
            result.status,
            409
          );

          assert.equal(
            result.json.code,
            "REVIVE_ADMIN_REQUEST_CONFLICT"
          );
        }
      );

      await t.test(
        "role revoked after earlier success",
        async () => {
          admins.set(
            "1",
            {
              ...admins.get("1"),

              role: "manager",
            }
          );

          await expectDenied({
            token:
              tokenFor(1),

            body: {
              ...baseBody,

              request_id:
                "20000000-0000-4000-8000-000000000001",
            },

            status: 403,
          });
        }
      );

      assert.equal(
        completed.size,
        1,
        "Only one distinct adjustment may have been applied"
      );

    } finally {
      if (server) {
        await new Promise(
          (resolve, reject) => {
            server.close(
              (error) =>
                error
                  ? reject(error)
                  : resolve()
            );
          }
        );
      }

      for (
        const [
          filename,
          cached
        ] of previous
      ) {
        if (cached) {
          require.cache[
            filename
          ] = cached;
        } else {
          delete require.cache[
            filename
          ];
        }
      }
    }
  }
);
