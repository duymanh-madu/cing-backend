"use strict";

const test = require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const root =
  path.resolve(
    __dirname,
    "../../../.."
  );

const source =
  fs.readFileSync(
    path.join(
      root,
      "routes/profileUpdateRoutes.js"
    ),
    "utf8"
  );

const start =
  source.indexOf(
    '// GET /profile-update/revive-credits-history/:userId'
  );

const end =
  source.indexOf(
    '// GET /profile-update/points-history/:userId',
    start
  );

const route =
  start >= 0 && end > start
    ? source.slice(start, end)
    : "";

test(
  "Revive Credit history has separate endpoint",
  () => {
    assert.match(
      route,
      /router\.get\(\s*"\/revive-credits-history\/:userId"\s*,\s*authMiddleware\s*,/
    );
  }
);

test(
  "history reads only projected Revive Credit events",
  () => {
    assert.match(
      route,
      /\.from\("analytics_events"\)/
    );

    assert.match(
      route,
      /\.eq\(\s*"event_name",\s*"revive_credits_added"\s*\)/
    );
  }
);

test(
  "history uses canonical reference identity",
  () => {
    assert.match(
      route,
      /metadata\?\.reference_type/
    );

    assert.match(
      route,
      /metadata\?\.reference_id/
    );

    assert.match(
      route,
      /seen\.has\(key\)/
    );
  }
);

test(
  "legacy history endpoint is preserved",
  () => {
    assert.match(
      source,
      /router\.get\("\/plays-history\/:userId"/
    );

    assert.match(
      source,
      /"plays_added", "plays_deducted"/
    );
  }
);

test(
  "new route does not mutate assets",
  () => {
    assert.doesNotMatch(
      route,
      /\.update\(|\.insert\(|\.delete\(|\.rpc\(/
    );

    assert.doesNotMatch(
      route,
      /game_plays\s*=|total_points\s*=/
    );
  }
);

test(
  "public response retains existing history shape",
  () => {
    assert.match(
      route,
      /event_name: item\.event_name/
    );

    assert.match(
      route,
      /event_data: item\.event_data/
    );

    assert.match(
      route,
      /created_at: item\.created_at/
    );
  }
);
