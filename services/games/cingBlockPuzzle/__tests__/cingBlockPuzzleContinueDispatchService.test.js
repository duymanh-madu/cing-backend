const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const Module =
  require("node:module");

const path =
  require("node:path");

const DISPATCH_PATH =
  path.resolve(
    __dirname,
    "../cingBlockPuzzleContinueDispatchService.js"
  );

const SESSION_ID =
  "11111111-1111-4111-8111-111111111111";

const REQUEST_ID =
  "22222222-2222-4222-8222-222222222222";

const CUSTOMER = {
  phone: "0912345678",
};

const V3 = {
  engine_version: 2,
  rules_version: 2,
  score_version: 2,
  replay_version: 3,
};

const V4 = {
  engine_version: 3,
  rules_version: 3,
  score_version: 3,
  replay_version: 4,
};

const V5 = {
  engine_version: 4,
  rules_version: 4,
  score_version: 3,
  replay_version: 5,
};

function session(
  version = V4,
  overrides = {}
) {
  return {
    id: SESSION_ID,
    user_id: CUSTOMER.phone,
    game_key:
      "cing-block-puzzle",

    ...version,
    status: "active",
    continue_count: 0,
    ...overrides,
  };
}

function request(
  overrides = {}
) {
  return {
    customer:
      CUSTOMER,

    sessionId:
      SESSION_ID,

    body: {
      request_id:
        REQUEST_ID,

      replay: {
        source:
          "mock-terminal-replay",
      },

      ...overrides,
    },
  };
}

function harness({
  sessionRow =
    session(),
} = {}) {
  const calls = [];

  const mocks = {
    "./cingBlockPuzzleSessionService": {
      resolveAuthenticatedUserId:
        (customer) => {
          calls.push(
            ["identity"]
          );

          return customer.phone;
        },
    },

    "./domain/cingBlockPuzzleContinueContracts": {
      normalizeContinueRequest:
        ({sessionId, body}) => {
          calls.push(
            ["normalize"]
          );

          return {
            session_id:
              sessionId,

            request_id:
              body.request_id,

            replay:
              body.replay,
          };
        },
    },

    "./repositories/cingBlockPuzzleSessionRepository": {
      getSessionForSubmission:
        async (id) => {
          calls.push(
            ["lookup", id]
          );

          return sessionRow;
        },
    },

    "./cingBlockPuzzleContinueService": {
      purchaseGameplayContinue:
        async (args) => {
          calls.push(
            ["legacy", args]
          );

          return {
            financial_authority:
              "legacy",
          };
        },
    },

    "./cingBlockPuzzleV5ReviveService": {
      purchaseV5GameplayRevive:
        async (args) => {
          calls.push(
            ["v5", args]
          );

          return {
            financial_authority:
              "v5",
          };
        },
    },
  };

  const originalLoad =
    Module._load;

  try {
    Module._load = function (
      name,
      parent,
      isMain
    ) {
      if (
        parent?.filename ===
          DISPATCH_PATH &&
        Object.prototype.hasOwnProperty.call(
          mocks,
          name
        )
      ) {
        return mocks[name];
      }

      return originalLoad.call(
        this,
        name,
        parent,
        isMain
      );
    };

    delete require.cache[
      DISPATCH_PATH
    ];

    const dispatcher =
      require(
        DISPATCH_PATH
      );

    return {
      dispatcher,
      calls,
    };
  } finally {
    Module._load =
      originalLoad;

    delete require.cache[
      DISPATCH_PATH
    ];
  }
}

function financialCalls(
  calls
) {
  return calls.filter(
    ([kind]) =>
      kind === "legacy" ||
      kind === "v5"
  );
}

test(
  "Replay V3 retains legacy points authority",
  async () => {
    const {
      dispatcher,
      calls,
    } = harness({
      sessionRow:
        session(V3),
    });

    const result =
      await dispatcher
        .purchaseVersionedGameplayContinue(
          request()
        );

    assert.equal(
      result.financial_authority,
      "legacy"
    );

    assert.deepEqual(
      financialCalls(calls).map(
        ([kind]) => kind
      ),
      ["legacy"]
    );
  }
);

test(
  "Replay V4 retains legacy points authority",
  async () => {
    const {
      dispatcher,
      calls,
    } = harness({
      sessionRow:
        session(V4),
    });

    const result =
      await dispatcher
        .purchaseVersionedGameplayContinue(
          request()
        );

    assert.equal(
      result.financial_authority,
      "legacy"
    );

    assert.deepEqual(
      financialCalls(calls).map(
        ([kind]) => kind
      ),
      ["legacy"]
    );
  }
);

test(
  "exact V5 selects Revive Credit only",
  async () => {
    const {
      dispatcher,
      calls,
    } = harness({
      sessionRow:
        session(V5),
    });

    const result =
      await dispatcher
        .purchaseVersionedGameplayContinue(
          request()
        );

    assert.equal(
      result.financial_authority,
      "v5"
    );

    assert.deepEqual(
      financialCalls(calls).map(
        ([kind]) => kind
      ),
      ["v5"]
    );
  }
);

test(
  "client-supplied version cannot select authority",
  async () => {
    const {
      dispatcher,
      calls,
    } = harness({
      sessionRow:
        session(V4),
    });

    const result =
      await dispatcher
        .purchaseVersionedGameplayContinue(
          request({
            engine_version: 4,
            rules_version: 4,
            score_version: 3,
            replay_version: 5,
            credit_cost: 1,
          })
        );

    assert.equal(
      result.financial_authority,
      "legacy"
    );

    assert.deepEqual(
      financialCalls(calls).map(
        ([kind]) => kind
      ),
      ["legacy"]
    );
  }
);

test(
  "mixed tuple never reaches financial services",
  async () => {
    const {
      dispatcher,
      calls,
    } = harness({
      sessionRow:
        session({
          ...V5,
          rules_version: 3,
        }),
    });

    await assert.rejects(
      () =>
        dispatcher
          .purchaseVersionedGameplayContinue(
            request()
          ),
      {
        code:
          "BLOCK_PUZZLE_CONTINUE_VERSION_UNSUPPORTED",

        statusCode:
          409,
      }
    );

    assert.deepEqual(
      financialCalls(calls),
      []
    );
  }
);

test(
  "unsupported historical tuple fails closed",
  async () => {
    const {
      dispatcher,
      calls,
    } = harness({
      sessionRow:
        session({
          engine_version: 1,
          rules_version: 1,
          score_version: 1,
          replay_version: 1,
        }),
    });

    await assert.rejects(
      () =>
        dispatcher
          .purchaseVersionedGameplayContinue(
            request()
          ),
      {
        code:
          "BLOCK_PUZZLE_CONTINUE_VERSION_UNSUPPORTED",
      }
    );

    assert.deepEqual(
      financialCalls(calls),
      []
    );
  }
);

test(
  "wrong game key cannot dispatch money",
  async () => {
    const {
      dispatcher,
      calls,
    } = harness({
      sessionRow:
        session(
          V5,
          {
            game_key:
              "another-game",
          }
        ),
    });

    await assert.rejects(
      () =>
        dispatcher
          .purchaseVersionedGameplayContinue(
            request()
          ),
      {
        code:
          "BLOCK_PUZZLE_CONTINUE_GAME_INVALID",
      }
    );

    assert.deepEqual(
      financialCalls(calls),
      []
    );
  }
);

test(
  "missing session produces 404 without mutation",
  async () => {
    const {
      dispatcher,
      calls,
    } = harness({
      sessionRow: null,
    });

    await assert.rejects(
      () =>
        dispatcher
          .purchaseVersionedGameplayContinue(
            request()
          ),
      {
        code:
          "BLOCK_PUZZLE_SESSION_NOT_FOUND",

        statusCode: 404,
      }
    );

    assert.deepEqual(
      financialCalls(calls),
      []
    );
  }
);

test(
  "wrong owner never reaches either financial service",
  async () => {
    const {
      dispatcher,
      calls,
    } = harness({
      sessionRow:
        session(
          V5,
          {
            user_id:
              "another-user",
          }
        ),
    });

    await assert.rejects(
      () =>
        dispatcher
          .purchaseVersionedGameplayContinue(
            request()
          ),
      {
        code:
          "BLOCK_PUZZLE_SESSION_OWNERSHIP_MISMATCH",

        statusCode: 403,
      }
    );

    assert.deepEqual(
      financialCalls(calls),
      []
    );
  }
);

test(
  "V5 submitted historical retry still reaches service",
  async () => {
    const {
      dispatcher,
      calls,
    } = harness({
      sessionRow:
        session(
          V5,
          {
            status:
              "submitted",

            continue_count:
              5,
          }
        ),
    });

    await dispatcher
      .purchaseVersionedGameplayContinue(
        request()
      );

    assert.deepEqual(
      financialCalls(calls).map(
        ([kind]) => kind
      ),
      ["v5"]
    );
  }
);

test(
  "V5 expired historical retry still reaches service",
  async () => {
    const {
      dispatcher,
      calls,
    } = harness({
      sessionRow:
        session(
          V5,
          {
            status:
              "expired",

            continue_count:
              5,
          }
        ),
    });

    await dispatcher
      .purchaseVersionedGameplayContinue(
        request()
      );

    assert.deepEqual(
      financialCalls(calls).map(
        ([kind]) => kind
      ),
      ["v5"]
    );
  }
);

test(
  "dispatcher forwards original idempotency body",
  async () => {
    const {
      dispatcher,
      calls,
    } = harness({
      sessionRow:
        session(V5),
    });

    const input =
      request();

    await dispatcher
      .purchaseVersionedGameplayContinue(
        input
      );

    const call =
      financialCalls(calls)[0][1];

    assert.equal(
      call.body,
      input.body
    );

    assert.equal(
      call.body.request_id,
      REQUEST_ID
    );

    assert.equal(
      call.sessionId,
      SESSION_ID
    );
  }
);

test(
  "dispatch lookup happens before financial service",
  async () => {
    const {
      dispatcher,
      calls,
    } = harness({
      sessionRow:
        session(V5),
    });

    await dispatcher
      .purchaseVersionedGameplayContinue(
        request()
      );

    assert.deepEqual(
      calls.map(
        ([kind]) => kind
      ),
      [
        "identity",
        "normalize",
        "lookup",
        "v5",
      ]
    );
  }
);
