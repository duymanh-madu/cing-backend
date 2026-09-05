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
      "services/leaderboardResetService.js"
    ),
    "utf8"
  );

test(
  "canonical Top1 keeps legacy non-throwing default",
  () => {
    assert.match(
      source,
      /throwOnError\s*=\s*false/
    );
  }
);

test(
  "strict Top1 mode propagates outer processing failures",
  () => {
    assert.match(
      source,
      /if\s*\(\s*throwOnError\s*\)\s*\{[\s\S]*throw e/
    );
  }
);
