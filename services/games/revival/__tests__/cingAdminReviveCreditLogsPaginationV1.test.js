"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const source =
  fs.readFileSync(
    "routes/adminLogRoutes.js",
    "utf8"
  );

assert.match(
  source,
  /if \(filter === "revive_credit"\)/
);

assert.match(
  source,
  /\.from\(\s*"cing_revive_credit_transactions"\s*\)/
);

assert.match(
  source,
  /\.range\(\s*reviveOff,\s*reviveOff \+\s*safeLimit\s*\)/
);

for (const field of [
  "user_id",
  "reference_type",
  "reference_id",
  "reason",
  "game_key",
]) {
  assert.match(
    source,
    new RegExp(
      `"${field}"`
    )
  );
}

assert.match(
  source,
  /\.ilike\(\s*field,/
);

assert.match(
  source,
  /REVIVE_CREDIT_LOG_READ_FAILED/
);

assert.match(
  source,
  /REVIVE_CREDIT_LOG_SEARCH_FAILED/
);

assert.match(
  source,
  /has_more:\s*hasMore/
);

assert.match(
  source,
  /const fetchWindow/
);

assert.match(
  source,
  /ADMIN_LOG_READ_FAILED/
);

assert.doesNotMatch(
  source,
  /\.from\("cing_revive_credit_transactions"\)[\s\S]{0,1000}\.(?:insert|update|delete)\(/
);

console.log(
  "PASS: Revive Admin Logs use canonical paged searchable fail-visible reads"
);
