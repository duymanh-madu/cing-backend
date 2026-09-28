"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(
  __dirname,
  "../../../.."
);

const previous = fs.readFileSync(
  path.join(
    ROOT,
    "db/migrations/20260926_cing_points_revive_credit_snapshot_protection_v1.sql"
  ),
  "utf8"
);

const current = fs.readFileSync(
  path.join(
    ROOT,
    "db/migrations/20260926_cing_game_gift_snapshot_protection_v1.sql"
  ),
  "utf8"
);

const mirror = fs.readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20260926014000_cing_game_gift_snapshot_protection_v1.sql"
  ),
  "utf8"
);

function extract(source) {
  const matches = [
    ...source.matchAll(
      /create\s+or\s+replace\s+function\s+public\.cing_loyalty_apply_external_point_snapshot_guarded\s*\(/gi
    ),
  ];

  assert.equal(matches.length, 1);

  const tail = source.slice(
    matches[0].index
  );

  const end = tail.match(
    /\$function\$\s*;/i
  );

  assert.ok(end);

  return tail.slice(
    0,
    end.index + end[0].length
  );
}

test(
  "Gift snapshot mirror is exact",
  () => {
    assert.equal(
      current,
      mirror
    );
  }
);

test(
  "prior V4 Commerce Revive predicates unchanged",
  () => {
    const oldFunction =
      extract(previous);

    const newFunction =
      extract(current);

    const begin =
      newFunction.indexOf(
        "  /*\n   * CING GAME CENTER V2 — POINT-FUNDED GIFT"
      );

    const end =
      newFunction.indexOf(
        "  if v_protected then",
        begin
      );

    assert.ok(begin >= 0);
    assert.ok(end > begin);

    const recovered =
      newFunction.slice(0, begin)
      + newFunction.slice(end);

    /*
     * The Gift insertion leaves one additional blank
     * line at the insertion boundary.
     *
     * Normalize whitespace ONLY immediately before
     * the original final protection decision.
     *
     * All other SQL bytes must remain identical.
     */
    const normalizeInsertionBoundary = value =>
      value.replace(
        /\n{3,}(?=  if v_protected then)/g,
        "\\n\\n"
      );

    assert.equal(
      normalizeInsertionBoundary(recovered),
      normalizeInsertionBoundary(oldFunction)
    );
  }
);

test(
  "Gift snapshot fence belongs to sender and points",
  () => {
    assert.match(
      current,
      /g\.sender_user_id\s*=\s*p_user_id/i
    );

    assert.match(
      current,
      /g\.funding_source\s*=\s*'points'/i
    );
  }
);

test(
  "pending processing failed protect local points",
  () => {
    assert.match(
      current,
      /g\.ipos_sync_status\s+in\s*\(\s*'pending',\s*'processing',\s*'failed'/i
    );
  }
);

test(
  "player row remains serialization boundary",
  () => {
    const fn = extract(current);

    assert.match(
      fn,
      /from public\.players[\s\S]*for update/i
    );

    assert.match(
      fn,
      /update public\.players/i
    );
  }
);

test(
  "migration does not activate a financial RPC",
  () => {
    const executable =
      current.replace(
        /\/\*[\s\S]*?\*\//g,
        ""
      );

    assert.doesNotMatch(
      executable,
      /\bgrant execute\b/i
    );

    assert.doesNotMatch(
      executable,
      /insert into\s+public\.point_transactions/i
    );
  }
);
