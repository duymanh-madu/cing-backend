"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const servicePath = path.resolve(
  __dirname,
  "../cingOfflineReviveService.js"
);

const source = fs.readFileSync(
  servicePath,
  "utf8"
);

const validRequest =
  "11111111-1111-4111-8111-111111111111";

const sessionId =
  "22222222-2222-4222-8222-222222222222";

const customer = {
  phone: "0912345678",
};

function loadService({
  balance = 0,
  session = null,
  event = null,
  calls,
} = {}) {
  const repo = {
    async readOfflineReviveCreditBalance(args) {
      calls.push({
        op: "balance",
        args,
      });

      return balance;
    },

    async recoverOfflineReviveSession(args) {
      calls.push({
        op: "session",
        args,
      });

      return session;
    },

    async readOfflineRevivePendingEvent(args) {
      calls.push({
        op: "event",
        args,
      });

      return event;
    },
  };

  for (const name of [
    "startOfflineReviveSession",
    "markOfflineRevivePending",
    "applyOfflineRevival",
    "finalizeOfflineReviveSession",
  ]) {
    repo[name] = () => {
      throw new Error(
        "Read service invoked mutation"
      );
    };
  }

  const loaded = new Module(
    servicePath,
    module
  );

  loaded.filename = servicePath;

  loaded.paths = Module._nodeModulePaths(
    path.dirname(servicePath)
  );

  loaded.require = function(id) {
    if (
      id ===
      "./repositories/cingOfflineReviveRepository"
    ) {
      return repo;
    }

    return Module.prototype.require.call(
      this,
      id
    );
  };

  loaded._compile(
    source,
    servicePath
  );

  return loaded.exports;
}

function makeSession(overrides = {}) {
  return {
    id: sessionId,
    request_id: validRequest,
    user_id: customer.phone,
    game_key: "black-pearl-rush",
    status: "active",
    revives_used: 0,
    event_seq: 0,
    pending_reason: null,
    pending_at: null,
    created_at:
      "2026-09-23T00:00:00Z",
    expires_at:
      "2026-09-23T04:00:00Z",
    finalized_at: null,
    ...overrides,
  };
}

test(
  "balance read uses authenticated member",
  async () => {
    const calls = [];

    const service = loadService({
      balance: 31,
      calls,
    });

    assert.deepEqual(
      await service
        .getOfflineReviveCreditBalance({
          customer,
        }),
      { balance: 31 }
    );

    assert.deepEqual(
      calls,
      [
        {
          op: "balance",
          args: {
            userId: customer.phone,
          },
        },
      ]
    );
  }
);

test(
  "invalid balance fails closed",
  async () => {
    for (const balance of [
      -1,
      1.5,
      "31",
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      const calls = [];

      const service = loadService({
        balance,
        calls,
      });

      await assert.rejects(
        service
          .getOfflineReviveCreditBalance({
            customer,
          }),
        (error) =>
          error.code ===
          "REVIVAL_READ_BALANCE_INVALID"
      );
    }
  }
);

test(
  "missing member rejects before repository read",
  async () => {
    const calls = [];

    const service = loadService({
      calls,
    });

    await assert.rejects(
      service
        .getOfflineReviveCreditBalance({
          customer: {},
        }),
      (error) =>
        error.statusCode === 401
    );

    assert.equal(
      calls.length,
      0
    );
  }
);

test(
  "invalid recovery UUID rejects before read",
  async () => {
    const calls = [];

    const service = loadService({
      calls,
    });

    await assert.rejects(
      service.recoverOfflineRevival({
        customer,
        requestId: "bad-id",
      }),
      (error) =>
        error.statusCode === 400
    );

    assert.equal(
      calls.length,
      0
    );
  }
);

test(
  "active session recovers without mutation",
  async () => {
    const calls = [];

    const service = loadService({
      session: makeSession(),
      calls,
    });

    const result =
      await service.recoverOfflineRevival({
        customer,
        requestId: validRequest,
      });

    assert.equal(
      result.session_status,
      "active"
    );

    assert.equal(
      result.session_id,
      sessionId
    );

    assert.equal(
      result.pending_event,
      null
    );

    assert.deepEqual(
      calls.map((call) => call.op),
      ["session"]
    );
  }
);

test(
  "missing session returns 404",
  async () => {
    const calls = [];

    const service = loadService({
      session: null,
      calls,
    });

    await assert.rejects(
      service.recoverOfflineRevival({
        customer,
        requestId: validRequest,
      }),
      (error) =>
        error.code ===
          "REVIVAL_SESSION_NOT_FOUND" &&
        error.statusCode === 404
    );
  }
);

test(
  "foreign session is not exposed",
  async () => {
    const calls = [];

    const service = loadService({
      session: makeSession({
        user_id: "0999999999",
      }),
      calls,
    });

    await assert.rejects(
      service.recoverOfflineRevival({
        customer,
        requestId: validRequest,
      }),
      (error) =>
        error.statusCode === 500
    );
  }
);

test(
  "pending recovery preserves full bigint",
  async () => {
    const calls = [];

    const service = loadService({
      session: makeSession({
        status: "revive_pending",
        event_seq: 1,
        pending_reason: "death",
        pending_at:
          "2026-09-23T00:02:00Z",
      }),

      event: {
        id: "9007199254740993",
        session_id: sessionId,
        user_id: customer.phone,
        event_seq: 1,
        event_type: "revive_pending",
        pending_reason: "death",
      },

      calls,
    });

    const result =
      await service.recoverOfflineRevival({
        customer,
        requestId: validRequest,
      });

    assert.deepEqual(
      result.pending_event,
      {
        event_id:
          "9007199254740993",
        event_seq: 1,
        reason: "death",
      }
    );

    assert.deepEqual(
      calls.map((call) => call.op),
      ["session", "event"]
    );
  }
);

test(
  "missing pending event fails closed",
  async () => {
    const calls = [];

    const service = loadService({
      session: makeSession({
        status: "revive_pending",
        event_seq: 1,
        pending_reason: "death",
      }),
      event: null,
      calls,
    });

    await assert.rejects(
      service.recoverOfflineRevival({
        customer,
        requestId: validRequest,
      }),
      (error) =>
        error.code ===
        "REVIVAL_READ_PENDING_INCONSISTENT"
    );
  }
);

test(
  "unsafe numeric bigint is rejected",
  async () => {
    const calls = [];

    const service = loadService({
      session: makeSession({
        status: "revive_pending",
        event_seq: 1,
        pending_reason: "death",
      }),

      event: {
        id:
          Number.MAX_SAFE_INTEGER + 2,
        session_id: sessionId,
        user_id: customer.phone,
        event_seq: 1,
        event_type: "revive_pending",
        pending_reason: "death",
      },

      calls,
    });

    await assert.rejects(
      service.recoverOfflineRevival({
        customer,
        requestId: validRequest,
      }),
      (error) =>
        error.code ===
        "REVIVAL_READ_PENDING_ID_INVALID"
    );
  }
);
