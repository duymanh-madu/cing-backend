const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const sql = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../../db/migrations/20260831_zzzzzzz_cing_artillery_execution_revision_claim_fence_v1.sql"
  ),
  "utf8"
);

test("revision belongs to live claim token", () => {
  assert.match(
    sql,
    /expected_terrain_revision_claim_token uuid/iu
  );

  assert.match(
    sql,
    /expected_terrain_revision_claim_token\s*=\s*p_claim_token/iu
  );

  assert.match(
    sql,
    /expected_terrain_revision_claim_token[\s\S]*IS DISTINCT FROM p_claim_token/iu
  );
});

test("settlement rejects stale terrain revision", () => {
  assert.match(
    sql,
    /CING_ARTILLERY_SHOT_EXECUTION_TERRAIN_REVISION_STALE/iu
  );

  assert.match(
    sql,
    /v_execution\.expected_terrain_revision\s*<>\s*v_terrain\.terrain_revision/iu
  );
});

test("settlement keeps frozen 21 parameter signature", () => {
  const m = sql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?cing_artillery_commit_resolution_fenced_atomic\s*\(([\s\S]*?)\)\s*RETURNS/iu
  );

  assert.ok(m);

  const params = m[1]
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  assert.equal(params.length, 21);
});

test("mutable positions remain execution authority", () => {
  assert.doesNotMatch(
    sql,
    /v_world\.player_one_x|v_world\.player_one_y|v_world\.player_two_x|v_world\.player_two_y/iu
  );

  assert.match(
    sql,
    /v_shooter\.position_x/iu
  );

  assert.match(
    sql,
    /v_opponent\.position_x/iu
  );
});

test("RPC ACL remains service-role only", () => {
  assert.match(
    sql,
    /cing_artillery_materialize_shot_execution_context_atomic[\s\S]*FROM PUBLIC, anon, authenticated[\s\S]*TO service_role/iu
  );

  assert.match(
    sql,
    /cing_artillery_commit_resolution_fenced_atomic[\s\S]*FROM PUBLIC, anon, authenticated[\s\S]*TO service_role/iu
  );
});
