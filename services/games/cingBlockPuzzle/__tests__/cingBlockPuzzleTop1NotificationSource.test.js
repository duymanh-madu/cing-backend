const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const source =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "services/games/cingBlockPuzzle/cingBlockPuzzleSubmitService.js"
    ),
    "utf8"
  );

test(
  "Top1 check runs only after authoritative score submission",
  () => {
    const rpc =
      source.indexOf(
        "await submitSessionAtomic"
      );

    const normalize =
      source.indexOf(
        "normalizeSubmitRpcResult",
        rpc
      );

    const mismatch =
      source.indexOf(
        "BLOCK_PUZZLE_SUBMIT_AUTHORITY_MISMATCH"
      );

    const top1 =
      source.indexOf(
        "checkAndNotifyTop1Changes"
      );

    assert.ok(rpc >= 0);
    assert.ok(normalize > rpc);
    assert.ok(mismatch > normalize);
    assert.ok(top1 > mismatch);
  }
);

test(
  "Block Puzzle reuses canonical shared Top1 notification service",
  () => {
    assert.match(
      source,
      /require\(\s*["']\.\.\/\.\.\/leaderboardResetService["']\s*\)/
    );

    assert.match(
      source,
      /await checkAndNotifyTop1Changes\([\s\S]*global\._ioInstance[\s\S]*global\.io/
    );
  }
);

test(
  "idempotent submit retry is allowed to recover lost post-commit notification",
  () => {
    assert.doesNotMatch(
      source,
      /if\s*\(\s*!?\s*persisted\.idempotent\s*\)[\s\S]{0,300}checkAndNotifyTop1Changes/
    );

    assert.match(
      source,
      /top1_cache provides the[\s\S]*duplicate-notification fence/i
    );
  }
);

test(
  "Top1 side effect failure cannot invalidate committed gameplay submit",
  () => {
    const top1 =
      source.indexOf(
        "checkAndNotifyTop1Changes"
      );

    const catchIndex =
      source.indexOf(
        "} catch (error) {",
        top1
      );

    const returned =
      source.indexOf(
        "return persisted;",
        top1
      );

    assert.ok(top1 >= 0);
    assert.ok(catchIndex > top1);
    assert.ok(returned > catchIndex);
  }
);
