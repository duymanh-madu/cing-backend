"use strict";

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

assert.ok(
  start >= 0 &&
  end > start
);

const route =
  source.slice(
    start,
    end
  );

assert.match(
  route,
  /authMiddleware/
);

assert.match(
  route,
  /\.from\(\s*"cing_revive_credit_balances"\s*\)/
);

assert.match(
  route,
  /\.from\(\s*"cing_revive_credit_transactions"\s*\)/
);

assert.match(
  route,
  /transaction_type/
);

assert.match(
  route,
  /balance_before/
);

assert.match(
  route,
  /balance_after/
);

assert.match(
  route,
  /reference_type/
);

assert.match(
  route,
  /total_earned/
);

assert.match(
  route,
  /total_used/
);

assert.doesNotMatch(
  route,
  /\.from\(\s*"analytics_events"\s*\)/
);

assert.match(
  route,
  /REVIVE_HISTORY_IDENTITY_MISMATCH/
);

console.log(
  "PASS: Profile Revive Credit uses canonical balance + ledger authority"
);
