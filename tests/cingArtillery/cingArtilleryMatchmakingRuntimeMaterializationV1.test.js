"use strict";

const test =
  require(
    "node:test"
  );

const assert =
  require(
    "node:assert/strict"
  );

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );

const {
  loadFreshWithMocks,
} = require(
  "./helpers/loadFreshWithMocks"
);

const TARGET =
  "../../services/games/cingArtillery/services/cingArtilleryMatchmakingService";

const ACCOUNT_ID =
  "11111111-1111-4111-8111-111111111111";

const SESSION_ID =
  "22222222-2222-4222-8222-222222222222";

const MATCH_ID =
  "33333333-3333-4333-8333-333333333333";

const OPPONENT_ACCOUNT_ID =
  "44444444-4444-4444-8444-444444444444";

const OPPONENT_SESSION_ID =
  "55555555-5555-4555-8555-555555555555";

function readyDecision() {
  return {
    state:
      "ready",

    ready:
      true,

    onboarding_required:
      false,

    account_inactive:
      false,

    profile: {
      account: {
        id:
          ACCOUNT_ID,
      },
    },
  };
}

function activeSession() {
  return {
    id:
      SESSION_ID,

    account_id:
      ACCOUNT_ID,

    status:
      "active",

    started_at:
      "2026-08-25T00:00:00.000Z",

    ended_at:
      null,

    created_at:
      "2026-08-25T00:00:00.000Z",

    updated_at:
      "2026-08-25T00:00:00.000Z",
  };
}

function matchmakingRow(
  status
) {
  const matched =
    status ===
    "matched";

  return {
    ticket_id:
      "66666666-6666-4666-8666-666666666666",

    ticket_status:
      status,

    gameplay_session_id:
      SESSION_ID,

    match_id:
      matched
        ? MATCH_ID
        : null,

    opponent_account_id:
      matched
        ? OPPONENT_ACCOUNT_ID
        : null,

    opponent_gameplay_session_id:
      matched
        ? OPPONENT_SESSION_ID
        : null,

    queued_at:
      "2026-08-25T00:00:00.000Z",

    matched_at:
      matched
        ? "2026-08-25T00:00:01.000Z"
        : null,
  };
}

function loadService({
  status,
  materialize,
}) {
  return loadFreshWithMocks({
    target:
      TARGET,

    mocks: {
      "../../services/games/cingArtillery/services/cingArtilleryGameEntryService":
        {
          getGameEntryDecision:
            async () =>
              readyDecision(),
        },

      "../../services/games/cingArtillery/repositories/cingArtilleryGameplaySessionRepository":
        {
          findActiveByAccountId:
            async () =>
              activeSession(),
        },

      "../../services/games/cingArtillery/repositories/cingArtilleryMatchmakingRepository":
        {
          enterAtomic:
            async () =>
              matchmakingRow(
                status
              ),
        },

      "../../services/games/cingArtillery/services/cingArtilleryMatchRuntimeService":
        {
          getOrCreateMatchRuntime:
            materialize,
        },
    },
  });
}

test(
  "waiting matchmaking does not materialize runtime",
  async () => {
    let calls =
      0;

    const service =
      loadService({
        status:
          "waiting",

        materialize:
          async () => {
            calls += 1;
          },
      });

    const result =
      await service.enterMatchmaking({
        userId:
          "user-test-1",

        gameplaySessionId:
          SESSION_ID,
      });

    assert.equal(
      result.status,
      "waiting"
    );

    assert.equal(
      result.match_id,
      null
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "matched matchmaking materializes runtime exactly once with canonical match id",
  async () => {
    const calls =
      [];

    const service =
      loadService({
        status:
          "matched",

        materialize:
          async (
            matchId
          ) => {
            calls.push(
              matchId
            );

            return {
              id:
                "77777777-7777-4777-8777-777777777777",

              match_id:
                matchId,
            };
          },
      });

    const result =
      await service.enterMatchmaking({
        userId:
          "user-test-1",

        gameplaySessionId:
          SESSION_ID,
      });

    assert.equal(
      result.status,
      "matched"
    );

    assert.equal(
      result.match_id,
      MATCH_ID
    );

    assert.deepEqual(
      calls,
      [
        MATCH_ID,
      ]
    );

    assert.equal(
      Object.prototype.hasOwnProperty.call(
        result,
        "runtime"
      ),
      false
    );

    assert.equal(
      Object.prototype.hasOwnProperty.call(
        result,
        "runtime_id"
      ),
      false
    );
  }
);

test(
  "matched recovery re-enters idempotent runtime materializer",
  async () => {
    let calls =
      0;

    const service =
      loadService({
        status:
          "matched",

        materialize:
          async (
            matchId
          ) => {
            assert.equal(
              matchId,
              MATCH_ID
            );

            calls += 1;

            return {
              id:
                "77777777-7777-4777-8777-777777777777",

              match_id:
                MATCH_ID,
            };
          },
      });

    await service.enterMatchmaking({
      userId:
        "user-test-1",

      gameplaySessionId:
        SESSION_ID,
    });

    await service.enterMatchmaking({
      userId:
        "user-test-1",

      gameplaySessionId:
        SESSION_ID,
    });

    assert.equal(
      calls,
      2
    );
  }
);

test(
  "runtime materialization failure rejects matched application response",
  async () => {
    const runtimeError =
      Object.assign(
        new Error(
          "runtime materialization failed"
        ),
        {
          code:
            "CING_ARTILLERY_MATCH_RUNTIME_STATE_INCONSISTENT",

          statusCode:
            500,
        }
      );

    const service =
      loadService({
        status:
          "matched",

        materialize:
          async () => {
            throw runtimeError;
          },
      });

    await assert.rejects(
      () =>
        service.enterMatchmaking({
          userId:
            "user-test-1",

          gameplaySessionId:
            SESSION_ID,
        }),
      (error) =>
        error ===
        runtimeError
    );
  }
);

test(
  "backend match runtime delegates effective-access authority to PostgreSQL",
  () => {
    const source =
      fs.readFileSync(
        path.resolve(
          __dirname,
          "../../services/games/cingArtillery/services/cingArtilleryMatchRuntimeService.js"
        ),
        "utf8"
      );

    assert.doesNotMatch(
      source,
      /requireCingArtilleryEnabled/u
    );

    assert.doesNotMatch(
      source,
      /cingArtilleryFeatureGateService/u
    );

    assert.match(
      source,
      /\.getOrCreateAtomic\s*\(/u
    );
  }
);
