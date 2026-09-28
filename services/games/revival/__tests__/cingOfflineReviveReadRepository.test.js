"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const repositoryPath = path.resolve(
  __dirname,
  "../repositories/cingOfflineReviveRepository.js"
);

const source = fs.readFileSync(
  repositoryPath,
  "utf8"
);

function loadRepository(responses, calls) {
  const supabase = {
    from(table) {
      const call = {
        table,
        fields: null,
        filters: [],
      };

      calls.push(call);

      const query = {
        select(fields) {
          call.fields = fields;
          return query;
        },

        eq(field, value) {
          call.filters.push([field, value]);
          return query;
        },

        async maybeSingle() {
          if (responses.length === 0) {
            throw new Error(
              "Unexpected repository query"
            );
          }

          return responses.shift();
        },
      };

      return query;
    },

    rpc() {
      throw new Error(
        "Read repository must not invoke RPC"
      );
    },
  };

  const loaded = new Module(
    repositoryPath,
    module
  );

  loaded.filename = repositoryPath;

  loaded.paths = Module._nodeModulePaths(
    path.dirname(repositoryPath)
  );

  loaded.require = function(id) {
    if (id === "../../../../supabase") {
      return supabase;
    }

    return Module.prototype.require.call(
      this,
      id
    );
  };

  loaded._compile(
    source,
    repositoryPath
  );

  return loaded.exports;
}

test(
  "missing credit balance is zero",
  async () => {
    const calls = [];

    const repository = loadRepository(
      [{ data: null, error: null }],
      calls
    );

    const balance =
      await repository
        .readOfflineReviveCreditBalance({
          userId: "0912345678",
        });

    assert.equal(balance, 0);

    assert.deepEqual(
      calls[0].filters,
      [["user_id", "0912345678"]]
    );

    assert.equal(
      calls[0].table,
      "cing_revive_credit_balances"
    );
  }
);

test(
  "credit balance is read without mutation",
  async () => {
    const calls = [];

    const repository = loadRepository(
      [
        {
          data: { balance: 31 },
          error: null,
        },
      ],
      calls
    );

    assert.equal(
      await repository
        .readOfflineReviveCreditBalance({
          userId: "0912345678",
        }),
      31
    );

    assert.equal(
      calls[0].fields,
      "balance"
    );
  }
);

test(
  "session recovery binds owner and original request",
  async () => {
    const calls = [];

    const session = {
      id: "session-a",
      user_id: "0912345678",
      request_id: "request-a",
      status: "revive_pending",
      event_seq: 1,
    };

    const repository = loadRepository(
      [{ data: session, error: null }],
      calls
    );

    const recovered =
      await repository
        .recoverOfflineReviveSession({
          userId: "0912345678",
          requestId: "request-a",
        });

    assert.equal(recovered, session);

    assert.deepEqual(
      calls[0].filters,
      [
        ["user_id", "0912345678"],
        ["request_id", "request-a"],
      ]
    );
  }
);

test(
  "pending event binds exact session and sequence",
  async () => {
    const calls = [];

    const event = {
      id: "9007199254740993",
      event_seq: 3,
      event_type: "revive_pending",
    };

    const repository = loadRepository(
      [{ data: event, error: null }],
      calls
    );

    const recovered =
      await repository
        .readOfflineRevivePendingEvent({
          userId: "0912345678",
          sessionId: "session-a",
          eventSeq: 3,
        });

    assert.equal(
      recovered.id,
      "9007199254740993"
    );

    assert.deepEqual(
      calls[0].filters,
      [
        ["user_id", "0912345678"],
        ["session_id", "session-a"],
        ["event_seq", 3],
        ["event_type", "revive_pending"],
      ]
    );
  }
);

test(
  "missing session and event remain null",
  async () => {
    const calls = [];

    const repository = loadRepository(
      [
        { data: null, error: null },
        { data: null, error: null },
      ],
      calls
    );

    assert.equal(
      await repository
        .recoverOfflineReviveSession({
          userId: "0912345678",
          requestId: "missing",
        }),
      null
    );

    assert.equal(
      await repository
        .readOfflineRevivePendingEvent({
          userId: "0912345678",
          sessionId: "missing",
          eventSeq: 1,
        }),
      null
    );
  }
);

test(
  "database errors propagate without mutation retry",
  async () => {
    const failure =
      new Error("isolated read failure");

    const calls = [];

    const repository = loadRepository(
      [{ data: null, error: failure }],
      calls
    );

    await assert.rejects(
      repository
        .readOfflineReviveCreditBalance({
          userId: "0912345678",
        }),
      (error) => error === failure
    );

    assert.equal(calls.length, 1);
  }
);
