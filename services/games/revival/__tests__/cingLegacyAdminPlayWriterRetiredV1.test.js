"use strict";

const assert =
  require("node:assert/strict");
const fs =
  require("node:fs");
const path =
  require("node:path");

const root =
  path.resolve(__dirname, "../../../..");

const source =
  fs.readFileSync(
    path.join(root, "routes/adminPlayerRoutes.js"),
    "utf8"
  );

const begin =
  source.indexOf(
    "// POST /admin/players/adjust-plays"
  );

const end =
  source.indexOf(
    "// POST /admin/players/adjust-points",
    begin
  );

assert.ok(begin >= 0);
assert.ok(end > begin);

const route =
  source.slice(begin, end);

assert.match(
  route,
  /router\.post\("\/adjust-plays", requireAdmin/
);

assert.match(
  route,
  /sendLegacyGamePlaysClosed\(res\)/
);

assert.doesNotMatch(
  route,
  /rejectLegacyGamePlaysMutation/
);

assert.doesNotMatch(
  route,
  /game_plays/
);

assert.doesNotMatch(
  route,
  /\.update\(/
);

assert.doesNotMatch(
  route,
  /\.insert\(/
);

assert.doesNotMatch(
  route,
  /plays_adjusted/
);

console.log(
  "PASS: legacy Admin play writer is permanently retired"
);
