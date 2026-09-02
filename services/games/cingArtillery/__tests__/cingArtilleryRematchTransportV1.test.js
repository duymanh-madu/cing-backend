"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const ROOT =
  path.resolve(
    __dirname,
    "../../../.."
  );

function read(
  relativePath
) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    "utf8"
  );
}

test(
  "rematch repository calls only canonical handshake RPC",
  () => {
    const source =
      read(
        "services/games/cingArtillery/repositories/" +
        "cingArtilleryRematchRepository.js"
      );

    assert.match(
      source,
      /cing_artillery_request_same_opponent_rematch_atomic_v1/u
    );

    assert.match(
      source,
      /p_source_match_id:\s*sourceMatchId/u
    );

    assert.match(
      source,
      /p_account_id:\s*accountId/u
    );

    assert.doesNotMatch(
      source,
      /\.insert\s*\(/u
    );

    assert.doesNotMatch(
      source,
      /\.update\s*\(/u
    );
  }
);

test(
  "rematch service resolves canonical account server-side",
  () => {
    const source =
      read(
        "services/games/cingArtillery/services/" +
        "cingArtilleryRematchService.js"
      );

    assert.match(
      source,
      /accountService[\s\S]*?getAccountByUserId\s*\(\s*userId\s*\)/u
    );

    assert.match(
      source,
      /accountId:\s*account\.id/u
    );

    assert.doesNotMatch(
      source,
      /opponentId/u
    );

    assert.doesNotMatch(
      source,
      /gameplaySessionId/u
    );
  }
);

test(
  "runtime is materialized only after canonical matched handshake",
  () => {
    const source =
      read(
        "services/games/cingArtillery/services/" +
        "cingArtilleryRematchService.js"
      );

    const guard =
      source.indexOf(
        "handshake.status !=="
      );

    const runtime =
      source.indexOf(
        "getOrCreateMatchRuntime"
      );

    assert.ok(
      guard >= 0
    );

    assert.ok(
      runtime > guard
    );

    assert.match(
      source,
      /getOrCreateMatchRuntime\s*\(\s*handshake\.rematch_match_id\s*\)/u
    );
  }
);

test(
  "rematch contract fails closed across waiting and matched states",
  () => {
    const source =
      read(
        "services/games/cingArtillery/domain/" +
        "cingArtilleryRematchContracts.js"
      );

    assert.match(
      source,
      /WAITING:\s*"waiting"/u
    );

    assert.match(
      source,
      /MATCHED:\s*"matched"/u
    );

    assert.match(
      source,
      /CING_ARTILLERY_REMATCH_RESULT_INVALID/u
    );

    assert.match(
      source,
      /runtime:\s*null/u
    );
  }
);

test(
  "HTTP rematch derives identity only from authenticated customer",
  () => {
    const source =
      read(
        "routes/cingArtilleryRoutes.js"
      );

    const start =
      source.indexOf(
        'router.post(\n  "/rematch"'
      );

    assert.ok(
      start >= 0
    );

    const block =
      source.slice(
        start
      );

    assert.match(
      block,
      /authMiddleware/u
    );

    assert.match(
      block,
      /getAuthenticatedUserId\s*\(\s*req\s*\)/u
    );

    assert.match(
      block,
      /req\.body\?\.source_match_id/u
    );

    for (const forbidden of [
      /req\.body\?\.(?:account_id|accountId)/u,
      /req\.body\?\.(?:opponent_id|opponentId)/u,
      /req\.body\?\.(?:gameplay_session_id|gameplaySessionId)/u,
      /req\.body\?\.(?:rematch_match_id|rematchMatchId)/u,
      /req\.body\?\.(?:user_id|userId)/u,
    ]) {
      assert.doesNotMatch(
        block,
        forbidden
      );
    }
  }
);

test(
  "rematch transport does not enter random matchmaking",
  () => {
    const service =
      read(
        "services/games/cingArtillery/services/" +
        "cingArtilleryRematchService.js"
      );

    const repository =
      read(
        "services/games/cingArtillery/repositories/" +
        "cingArtilleryRematchRepository.js"
      );

    assert.doesNotMatch(
      service,
      /enterMatchmaking/u
    );

    assert.doesNotMatch(
      repository,
      /enter_matchmaking/iu
    );
  }
);

test(
  "canonical artillery index exports rematch service",
  () => {
    const source =
      read(
        "services/games/cingArtillery/index.js"
      );

    assert.match(
      source,
      /cingArtilleryRematchService/u
    );

    assert.match(
      source,
      /\brematchService\b/u
    );
  }
);
