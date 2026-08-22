const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const path =
  require("path");

function read(
  relative
) {
  return fs.readFileSync(
    path.join(
      __dirname,
      relative
    ),
    "utf8"
  );
}

const repository =
  read(
    "../repositories/cingBlockPuzzleSessionRepository.js"
  );

const service =
  read(
    "../cingBlockPuzzleSubmitService.js"
  );

const route =
  read(
    "../../../../routes/cingBlockPuzzleRoutes.js"
  );

test(
  "repository submits only through verified atomic RPC",
  () => {
    assert.match(
      repository,
      /cing_block_puzzle_submit_session_atomic/
    );

    assert.doesNotMatch(
      service,
      /\.from\(\s*["']game_scores["']\s*\)\s*\.insert/
    );
  }
);

test(
  "service loads authoritative gameplay session before replay verification",
  () => {
    const load =
      service.indexOf(
        "await getSessionForSubmission"
      );

    const verify =
      service.indexOf(
        "await verifyReplayAuthority"
      );

    const persist =
      service.indexOf(
        "await submitSessionAtomic"
      );

    assert.ok(
      load >= 0
    );

    assert.ok(
      verify > load
    );

    assert.ok(
      persist > verify
    );
  }
);

test(
  "route exposes authenticated session submit endpoint",
  () => {
    assert.match(
      route,
      /\/session\/:session_id\/submit/
    );

    assert.match(
      route,
      /\/session\/:session_id\/submit[\s\S]*authMiddleware[\s\S]*gameScoreLimiter/
    );
  }
);

test(
  "Block Puzzle submit never calls generic saveGameScore",
  () => {
    assert.doesNotMatch(
      route,
      /saveGameScore/
    );

    assert.doesNotMatch(
      service,
      /saveGameScore/
    );
  }
);

test(
  "service verifies ended replay before PostgreSQL submission",
  () => {
    assert.match(
      service,
      /requireEnded:\s*true/
    );
  }
);

test(
  "service passes only server-derived score authority to RPC",
  () => {
    assert.match(
      service,
      /verifiedScore:\s*authority\.verified_score/
    );

    assert.match(
      service,
      /replayFingerprint:\s*authority\.replay_fingerprint/
    );

    assert.match(
      service,
      /moveCount:\s*authority\.move_count/
    );
  }
);
