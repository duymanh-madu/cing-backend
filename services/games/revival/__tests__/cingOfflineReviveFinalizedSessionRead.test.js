"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const FILE = path.resolve(
  __dirname,
  "../repositories/cingOfflineReviveScoreDeliveryRepository.js"
);

const ID =
  "22222222-2222-4222-8222-222222222222";

const GAME = "black-pearl-rush";
const USER = "0912345678";

const finalizedSession = {
  id: ID,
  user_id: USER,
  game_key: GAME,
  status: "finalized",
  final_score: 125,
  final_best_combo: 75,
  finalized_at:
    "2026-09-23T10:00:00.000Z",
};

function createRepository({
  session = finalizedSession,
  error = null,
} = {}) {
  const calls = [];

  const supabase = {
    from(table) {
      const filters = [];

      const query = {
        select(value) {
          calls.push({
            type: "select",
            table,
            value,
          });

          return query;
        },

        eq(key, value) {
          filters.push({
            key,
            value,
          });

          return query;
        },

        async maybeSingle() {
          calls.push({
            type: "read",
            table,
            filters,
          });

          return {
            data: session,
            error,
          };
        },
      };

      return query;
    },
  };

  const module = {
    exports: {},
  };

  vm.runInNewContext(
    fs.readFileSync(FILE, "utf8"),
    {
      module,
      exports: module.exports,
      Date,
      Number,
      String,
      require(request) {
        assert.equal(
          request,
          "../../../../supabase"
        );

        return supabase;
      },
    },
    {
      filename: FILE,
    }
  );

  return {
    repository: module.exports,
    calls,
  };
}

function read(repository) {
  return repository.getFinalizedSession({
    sessionId: ID,
    gameKey: GAME,
    userId: USER,
  });
}

test(
  "reads finalized session bound to exact job identity",
  async () => {
    const { repository, calls } =
      createRepository();

    const result = await read(repository);

    assert.equal(result.id, ID);
    assert.equal(result.final_score, 125);
    assert.equal(
      result.final_best_combo,
      75
    );

    const selected = calls.find(
      call => call.type === "select"
    );

    assert.equal(
      selected.table,
      "cing_offline_revive_sessions"
    );

    assert.match(
      selected.value,
      /final_best_combo/
    );

    const query = calls.find(
      call => call.type === "read"
    );

    assert.deepEqual(
      Array.from(
        query.filters,
        item => [item.key, item.value]
      ),
      [
        ["id", ID],
        ["game_key", GAME],
        ["user_id", USER],
        ["status", "finalized"],
      ]
    );
  }
);

test(
  "accepts finalized zero score and combo",
  async () => {
    const { repository } =
      createRepository({
        session: {
          ...finalizedSession,
          final_score: 0,
          final_best_combo: 0,
        },
      });

    const result = await read(repository);

    assert.equal(result.final_score, 0);
    assert.equal(
      result.final_best_combo,
      0
    );
  }
);

test(
  "missing session fails closed",
  async () => {
    const { repository } =
      createRepository({
        session: null,
      });

    await assert.rejects(
      read(repository),
      /REVIVAL_DELIVERY_FINALIZED_SESSION_INVALID/
    );
  }
);

test(
  "active session cannot enter challenge delivery",
  async () => {
    const { repository } =
      createRepository({
        session: {
          ...finalizedSession,
          status: "active",
        },
      });

    await assert.rejects(
      read(repository),
      /REVIVAL_DELIVERY_FINALIZED_SESSION_INVALID/
    );
  }
);

test(
  "wrong member cannot enter challenge delivery",
  async () => {
    const { repository } =
      createRepository({
        session: {
          ...finalizedSession,
          user_id: "0999999999",
        },
      });

    await assert.rejects(
      read(repository),
      /REVIVAL_DELIVERY_FINALIZED_SESSION_INVALID/
    );
  }
);

test(
  "wrong game cannot enter challenge delivery",
  async () => {
    const { repository } =
      createRepository({
        session: {
          ...finalizedSession,
          game_key: "cing-stack-tower",
        },
      });

    await assert.rejects(
      read(repository),
      /REVIVAL_DELIVERY_FINALIZED_SESSION_INVALID/
    );
  }
);

test(
  "invalid final result fails closed",
  async () => {
    const { repository } =
      createRepository({
        session: {
          ...finalizedSession,
          final_best_combo: null,
        },
      });

    await assert.rejects(
      read(repository),
      /REVIVAL_DELIVERY_FINALIZED_SESSION_INVALID/
    );
  }
);

test(
  "invalid finalization timestamp fails closed",
  async () => {
    const { repository } =
      createRepository({
        session: {
          ...finalizedSession,
          finalized_at: null,
        },
      });

    await assert.rejects(
      read(repository),
      /REVIVAL_DELIVERY_FINALIZED_SESSION_INVALID/
    );
  }
);

test(
  "Supabase error propagates",
  async () => {
    const { repository } =
      createRepository({
        error: new Error(
          "database unavailable"
        ),
      });

    await assert.rejects(
      read(repository),
      /database unavailable/
    );
  }
);

test(
  "invalid binding does not query database",
  async () => {
    const { repository, calls } =
      createRepository();

    await assert.rejects(
      repository.getFinalizedSession({
        sessionId: ID,
        gameKey: GAME,
        userId: "",
      }),
      /REVIVAL_DELIVERY_SESSION_BINDING_INVALID/
    );

    assert.equal(calls.length, 0);
  }
);

test(
  "finalized read never invokes RPC mutation",
  async () => {
    const { repository, calls } =
      createRepository();

    await read(repository);

    assert.equal(
      calls.filter(
        call => call.type === "rpc"
      ).length,
      0
    );
  }
);
