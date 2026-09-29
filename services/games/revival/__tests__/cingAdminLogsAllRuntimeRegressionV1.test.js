"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const source =
  fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../../routes/adminLogRoutes.js"
    ),
    "utf8"
  );

/*
 * Production regression 2026-09-29:
 *
 * Admin Activity Logs / filter=all returned:
 *   ReferenceError: rows is not defined
 *
 * Root cause:
 *
 *   const mapReviveCredits =
 *     (rows || []).map(...)
 *
 * The mapper must be a function whose rows value is supplied
 * by reviveCredits.data.
 */

assert.match(
  source,
  /const mapReviveCredits\s*=\s*\(rows\)\s*=>\s*\(rows \|\| \[\]\)\.map/
);

assert.doesNotMatch(
  source,
  /const mapReviveCredits\s*=\s*\(rows \|\| \[\]\)\.map/
);

assert.match(
  source,
  /\.\.\.mapReviveCredits\(reviveCredits\.data\)/
);

/*
 * Execute the corrected mapper semantics as a runtime guard.
 */
const mapReviveCredits =
  (rows) =>
    (rows || []).map((r) => ({
      ...r,
      _type:
        "revive_credit",
      amount:
        Number(r.amount || 0),
      balance_before:
        Number(r.balance_before || 0),
      balance_after:
        Number(r.balance_after || 0),
      source:
        r.reference_type || "",
      created_at:
        r.created_at,
    }));

const rows = [
  {
    id: 2055,
    user_id: "user-1",
    amount: "18",
    balance_before: "41",
    balance_after: "59",
    reference_type:
      "crm_order_spending_v2",
    created_at:
      "2026-09-29T00:00:00.000Z",
  },
];

const mapped =
  mapReviveCredits(rows);

assert.equal(
  mapped.length,
  1
);

assert.equal(
  mapped[0]._type,
  "revive_credit"
);

assert.equal(
  mapped[0].amount,
  18
);

assert.equal(
  mapped[0].balance_before,
  41
);

assert.equal(
  mapped[0].balance_after,
  59
);

assert.equal(
  mapped[0].source,
  "crm_order_spending_v2"
);

assert.deepEqual(
  mapReviveCredits(null),
  []
);

console.log(
  "PASS: Admin Logs filter=all Revive mapper cannot reference undeclared rows"
);
