"use strict";

const test = require("node:test");
const assert = require(
  "node:assert/strict"
);

const fs = require("node:fs");
const path = require("node:path");

/*
 * ISOLATED_SUPABASE_TEST_HARNESS
 *
 * The service eagerly imports the
 * production Supabase module.
 *
 * Unit tests supply their own RPC client
 * and must not initialize a live client
 * or require production credentials.
 */

const supabaseModulePath =
  require.resolve(
    "../../../../supabase"
  );

const originalSupabaseCache =
  require.cache[supabaseModulePath];

require.cache[supabaseModulePath] = {
  id: supabaseModulePath,
  filename: supabaseModulePath,
  loaded: true,
  exports: {
    rpc() {
      throw new Error(
        "TEST_CLIENT_INJECTION_REQUIRED"
      );
    },
  },
};

let applyRevivalAdminChallenges;

try {
  ({
    applyRevivalAdminChallenges,
  } = require(
    "../cingOfflineReviveAdminApplyService"
  ));
} finally {
  if (originalSupabaseCache) {
    require.cache[supabaseModulePath] =
      originalSupabaseCache;
  } else {
    delete require.cache[supabaseModulePath];
  }
}

const routeSource =
  fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../../routes/appConfigRoutes.js"
    ),
    "utf8"
  );

const REQUEST_ID =
  "84a1d2e3-f456-4789-a123-456789abcdef";

function request() {
  return {
    admin: {
      id: 42,
      role: "super_admin",
    },

    applyRequestId:
      REQUEST_ID,

    challenges: [
      {
        game_key:
          "black-pearl-rush",
        enabled: true,
        challenge_type:
          "combo",
        target_value: 50,
        reward_points: 29,
      },
      {
        game_key:
          "chess",
        enabled: true,
        challenge_type:
          "wins",
        target_value: 3,
        reward_points: 50,
      },
    ],
  };
}

function successClient(
  calls
) {
  return {
    async rpc(name, args) {
      calls.push({
        name,
        args,
      });

      return {
        data: {
          applied: true,
          replayed: false,
          apply_request_id:
            REQUEST_ID,
          applied_at:
            "2026-09-23T06:00:00Z",
          games: [
            {
              game_key:
                "black-pearl-rush",
              enabled: true,
            },
            {
              game_key:
                "cing-stack-tower",
              enabled: false,
            },
          ],
        },
        error: null,
      };
    },
  };
}

test(
  "service calls exactly one atomic RPC",
  async () => {
    const calls = [];

    const result =
      await applyRevivalAdminChallenges(
        request(),
        successClient(calls)
      );

    assert.equal(
      calls.length,
      1
    );

    assert.equal(
      calls[0].name,
      "cing_offline_revive_admin_apply_v1"
    );

    assert.equal(
      result.applied,
      true
    );
  }
);

test(
  "RPC receives JWT Admin identity",
  async () => {
    const calls = [];

    await applyRevivalAdminChallenges(
      request(),
      successClient(calls)
    );

    assert.equal(
      calls[0].args
        .p_actor_admin_id,
      "42"
    );

    assert.equal(
      calls[0].args
        .p_apply_request_id,
      REQUEST_ID
    );
  }
);

test(
  "Chess stays in complete Admin payload",
  async () => {
    const calls = [];

    await applyRevivalAdminChallenges(
      request(),
      successClient(calls)
    );

    const args =
      calls[0].args;

    assert.equal(
      args.p_full_challenges.length,
      2
    );

    assert.equal(
      args.p_full_challenges[1]
        .game_key,
      "chess"
    );

    assert.equal(
      args.p_revival_challenges.length,
      2
    );

    assert.equal(
      args.p_revival_challenges.some(
        c =>
          c.game_key ===
          "chess"
      ),
      false
    );
  }
);

test(
  "invalid reward never reaches RPC",
  async () => {
    const calls = [];

    const input = request();

    input.challenges[0]
      .reward_points = 0;

    await assert.rejects(
      applyRevivalAdminChallenges(
        input,
        successClient(calls)
      ),
      {
        code:
          "REVIVAL_ADMIN_REWARD_INVALID",
      }
    );

    assert.equal(
      calls.length,
      0
    );
  }
);

test(
  "non Super Admin never reaches RPC",
  async () => {
    const calls = [];

    const input = request();

    input.admin.role =
      "manager";

    await assert.rejects(
      applyRevivalAdminChallenges(
        input,
        successClient(calls)
      ),
      {
        code:
          "REVIVAL_APPLY_SUPER_ADMIN_REQUIRED",
      }
    );

    assert.equal(
      calls.length,
      0
    );
  }
);

test(
  "request conflict produces HTTP 409 contract",
  async () => {
    await assert.rejects(
      applyRevivalAdminChallenges(
        request(),
        {
          async rpc() {
            return {
              data: null,
              error: {
                code: "23505",
                message:
                  "REVIVAL_APPLY_REQUEST_CONFLICT",
              },
            };
          },
        }
      ),
      error =>
        error.code ===
          "REVIVAL_APPLY_REQUEST_CONFLICT" &&
        error.statusCode === 409
    );
  }
);

test(
  "DB Super Admin rejection is preserved",
  async () => {
    await assert.rejects(
      applyRevivalAdminChallenges(
        request(),
        {
          async rpc() {
            return {
              data: null,
              error: {
                code: "42501",
                message:
                  "REVIVAL_APPLY_SUPER_ADMIN_REQUIRED",
              },
            };
          },
        }
      ),
      error =>
        error.statusCode === 403
    );
  }
);

test(
  "malformed RPC success is rejected",
  async () => {
    await assert.rejects(
      applyRevivalAdminChallenges(
        request(),
        {
          async rpc() {
            return {
              data: {
                applied: true,
              },
              error: null,
            };
          },
        }
      ),
      {
        code:
          "REVIVAL_ADMIN_APPLY_RESULT_INVALID",
      }
    );
  }
);

test(
  "endpoint requires JWT and Super Admin",
  () => {
    assert.match(
      routeSource,
      /router\.post\(\s*"\/revival-challenges\/apply",\s*verifyAdmin,\s*requireChallengeSuperAdmin,\s*async\s*\(req,\s*res\)/i
    );
  }
);

test(
  "route forwards authenticated actor",
  () => {
    assert.match(
      routeSource,
      /admin:\s*req\.admin/i
    );

    assert.match(
      routeSource,
      /applyRequestId:\s*req\.body\?\.apply_request_id/i
    );

    assert.doesNotMatch(
      routeSource,
      /admin:\s*req\.body/i
    );
  }
);

test(
  "legacy public config read remains",
  () => {
    assert.match(
      routeSource,
      /router\.get\(\s*"\/public"/i
    );
  }
);
