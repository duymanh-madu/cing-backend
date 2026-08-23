const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

function read(path) {
  return fs.readFileSync(
    path,
    "utf8"
  );
}

const service =
  read(
    "services/games/cingBlockPuzzle/cingBlockPuzzleContinueService.js"
  );

const repository =
  read(
    "services/games/cingBlockPuzzle/repositories/cingBlockPuzzleSessionRepository.js"
  );

const routes =
  read(
    "routes/cingBlockPuzzleRoutes.js"
  );

const submitService =
  read(
    "services/games/cingBlockPuzzle/cingBlockPuzzleSubmitService.js"
  );

const migration =
  read(
    "db/migrations/20260823_cing_block_puzzle_submit_continue_binding_v1.sql"
  );

test(
  "continue endpoint is authenticated and replay proven",
  () => {
    assert.match(
      routes,
      /\/session\/:session_id\/continue[\s\S]*authMiddleware[\s\S]*purchaseGameplayContinue/
    );

    assert.match(
      service,
      /verifyReplayAuthority[\s\S]*requireEnded:[\s\S]*true/
    );
  }
);

test(
  "client cannot choose continue price",
  () => {
    assert.doesNotMatch(
      service,
      /body\.points_cost|body\.price|body\.cost/
    );

    assert.doesNotMatch(
      repository,
      /p_points_cost|p_price/
    );
  }
);

test(
  "continue purchase requires replay count to match durable purchases",
  () => {
    assert.match(
      service,
      /continuesUsed !==[\s\S]*session\.continue_count/
    );

    assert.match(
      repository,
      /continue_count/
    );
  }
);

test(
  "submit is also bound to purchased continue count",
  () => {
    assert.match(
      submitService,
      /authority\.continues_used !==[\s\S]*session\.continue_count/
    );

    assert.match(
      repository,
      /p_continues_used/
    );

    assert.match(
      migration,
      /p_continues_used <>[\s\S]*v_session\.continue_count/
    );
  }
);

test(
  "new submit wrapper closes purchase submit race with session lock",
  () => {
    assert.match(
      migration,
      /from public\.cing_block_puzzle_sessions[\s\S]*for update/
    );

    assert.match(
      migration,
      /cing_block_puzzle_submit_session_atomic_v2/
    );
  }
);

test(
  "submit wrapper rollout preserves legacy backend compatibility",
  () => {
    assert.match(
      migration,
      /Expand-phase compatibility/
    );

    assert.doesNotMatch(
      migration,
      /cing_block_puzzle_submit_session_atomic\([\s\S]*from service_role/
    );

    assert.match(
      migration,
      /grant execute[\s\S]*cing_block_puzzle_submit_session_atomic_v2[\s\S]*to service_role/
    );
  }
);

test(
  "continue service never calls generic deductPoints",
  () => {
    assert.doesNotMatch(
      service,
      /deductPoints/
    );
  }
);
