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
      "routes/adminLogRoutes.js"
    ),
    "utf8"
  );

assert.match(
  source,
  /filter==="revive_credit"/
);

assert.match(
  source,
  /\.from\("cing_revive_credit_transactions"\)/
);

for (const field of [
  "transaction_type",
  "amount",
  "balance_before",
  "balance_after",
  "reason",
  "game_key",
  "session_id",
  "reference_type",
  "reference_id",
  "created_at",
]) {
  assert.match(
    source,
    new RegExp(field)
  );
}

assert.match(
  source,
  /_type:\s*"revive_credit"/
);

assert.doesNotMatch(
  source,
  /needAll\s*\|\|\s*filter==="plays_bought"/
);

assert.doesNotMatch(
  source,
  /needAll\s*\|\|\s*filter==="plays_given"/
);

assert.match(
  source,
  /legacy_plays_bought/
);

assert.match(
  source,
  /legacy_plays_given/
);

assert.doesNotMatch(
  source,
  /\.from\("cing_revive_credit_transactions"\)[\s\S]{0,600}\.(?:insert|update|delete)\(/
);

console.log(
  "PASS: Admin Logs uses canonical Revive Credit ledger"
);
