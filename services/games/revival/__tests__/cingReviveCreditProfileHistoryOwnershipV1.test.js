"use strict";

const test =
  require("node:test");

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
    "// GET /profile-update/revive-credits-history/:userId"
  );

const end =
  source.indexOf(
    "// GET /profile-update/points-history/:userId",
    start
  );

const section =
  start >= 0 && end > start
    ? source.slice(
        start,
        end
      )
    : "";

test(
  "new history endpoint requires existing authMiddleware",
  () => {
    assert.match(
      source,
      /require\("\.\.\/middlewares\/authMiddleware"\)/
    );

    assert.match(
      section,
      /"\/revive-credits-history\/:userId",\s*authMiddleware,\s*async/
    );
  }
);

test(
  "identity comes from authenticated customer phone",
  () => {
    assert.match(
      section,
      /normalizePhone\(\s*req\.customer\?\.phone\s*\|\|\s*""\s*\)/
    );

    assert.match(
      section,
      /requestedPhone\s*!==\s*phone/
    );
  }
);

test(
  "missing canonical identity fails closed",
  () => {
    assert.match(
      section,
      /REVIVE_HISTORY_IDENTITY_REQUIRED/
    );

    assert.match(
      section,
      /!customerZaloId/
    );
  }
);

test(
  "cross-account URL fails closed",
  () => {
    assert.match(
      section,
      /REVIVE_HISTORY_FORBIDDEN/
    );

    assert.match(
      section,
      /return res\.status\(403\)/
    );
  }
);

test(
  "Zalo aliases require matching identity",
  () => {
    assert.match(
      section,
      /playerZaloId\s*!==\s*customerZaloId/
    );

    assert.match(
      section,
      /REVIVE_HISTORY_IDENTITY_MISMATCH/
    );
  }
);

test(
  "history query occurs after ownership checks",
  () => {
    const ownership =
      section.indexOf(
        "requestedPhone !== phone"
      );

    const zaloCheck =
      section.indexOf(
        "playerZaloId !== customerZaloId"
      );

    const history =
      section.indexOf(
        '.from("analytics_events")'
      );

    assert.ok(
      ownership >= 0
    );

    assert.ok(
      zaloCheck > ownership
    );

    assert.ok(
      history > zaloCheck
    );
  }
);

test(
  "history stays read-only and Credit-specific",
  () => {
    assert.match(
      section,
      /revive_credits_added/
    );

    assert.doesNotMatch(
      section,
      /\.insert\(|\.update\(|\.delete\(|\.rpc\(/
    );
  }
);

test(
  "legacy plays and points endpoints are unchanged",
  () => {
    assert.match(
      source,
      /router\.get\("\/plays-history\/:userId"/
    );

    assert.match(
      source,
      /router\.get\("\/points-history\/:userId"/
    );
  }
);
