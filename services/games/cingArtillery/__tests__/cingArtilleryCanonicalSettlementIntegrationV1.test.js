const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../../db/migrations/20260831_zzzz_cing_artillery_canonical_settlement_integration_v1.sql'
  ),
  'utf8'
);

const functionStart = migration.indexOf(
  'CREATE OR REPLACE FUNCTION'
);

const functionEnd = migration.indexOf(
  '$$;',
  functionStart
);

assert.ok(functionStart >= 0);
assert.ok(functionEnd > functionStart);

const fn = migration.slice(
  functionStart,
  functionEnd
);

test('integration replaces canonical fenced writer without changing public signature', () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION\s+public\.cing_artillery_commit_resolution_fenced_atomic\s*\(/
  );

  assert.match(
    migration,
    /p_execution_id uuid[\s\S]*p_claim_token uuid[\s\S]*p_physics_version integer[\s\S]*p_outcome text/
  );
});

test('completed retry returns before mutable settlement authority is touched', () => {
  const retryReturn = fn.indexOf(
    'RETURN v_existing;'
  );

  const terrainLock = fn.indexOf(
    'FROM public.cing_artillery_combat_terrain_states AS t'
  );

  const playerLock = fn.indexOf(
    'FROM public.cing_artillery_player_world_states AS p'
  );

  assert.ok(retryReturn > 0);
  assert.ok(terrainLock > retryReturn);
  assert.ok(playerLock > retryReturn);
});

test('fresh resolution locks mutable terrain authority', () => {
  assert.match(
    fn,
    /SELECT t\.\*[\s\S]*INTO v_terrain[\s\S]*FROM public\.cing_artillery_combat_terrain_states AS t[\s\S]*FOR UPDATE;/
  );

  assert.match(
    fn,
    /CING_ARTILLERY_RESOLUTION_TERRAIN_AUTHORITY_INVALID/
  );
});

test('mutable terrain identity is fenced to combat runtime match map and dimensions', () => {
  assert.match(
    fn,
    /v_terrain\.match_runtime_id\s*<>\s*v_combat\.match_runtime_id/
  );

  assert.match(
    fn,
    /v_terrain\.match_id\s*<>\s*v_combat\.match_id/
  );

  assert.match(
    fn,
    /v_terrain\.map_id\s*<>\s*v_map\.id/
  );

  assert.match(
    fn,
    /v_terrain\.width_px\s*<>\s*v_map\.width_px/
  );

  assert.match(
    fn,
    /v_terrain\.height_px\s*<>\s*v_map\.height_px/
  );
});

test('mutable terrain collision mask is revalidated before use', () => {
  assert.match(
    fn,
    /cing_artillery_validate_collision_bitmask_v1\([\s\S]*v_terrain\.width_px[\s\S]*v_terrain\.height_px[\s\S]*v_terrain\.collision_mask/
  );
});

test('fresh resolution locks exactly both participant world states', () => {
  assert.match(
    fn,
    /participant_slot = 1[\s\S]*FOR UPDATE;/
  );

  assert.match(
    fn,
    /participant_slot = 2[\s\S]*FOR UPDATE;/
  );

  assert.match(
    fn,
    /CING_ARTILLERY_RESOLUTION_PLAYER_ONE_WORLD_INVALID/
  );

  assert.match(
    fn,
    /CING_ARTILLERY_RESOLUTION_PLAYER_TWO_WORLD_INVALID/
  );
});

test('player world identity is fenced to canonical combat participants', () => {
  assert.match(
    fn,
    /v_player_one_world\.gameplay_session_id\s*<>\s*v_combat\.player_one_gameplay_session_id/
  );

  assert.match(
    fn,
    /v_player_one_world\.account_id\s*<>\s*v_combat\.player_one_account_id/
  );

  assert.match(
    fn,
    /v_player_two_world\.gameplay_session_id\s*<>\s*v_combat\.player_two_gameplay_session_id/
  );

  assert.match(
    fn,
    /v_player_two_world\.account_id\s*<>\s*v_combat\.player_two_account_id/
  );
});

test('fresh shot requires both mutable player states stable', () => {
  assert.match(
    fn,
    /v_player_one_world\.motion_state <> 'stable'/
  );

  assert.match(
    fn,
    /v_player_two_world\.motion_state <> 'stable'/
  );
});

test('opponent collider center uses mutable ground-contact positions', () => {
  assert.match(
    fn,
    /v_player_two_world\.position_x::bigint/
  );

  assert.match(
    fn,
    /v_player_two_world\.position_y::bigint/
  );

  assert.match(
    fn,
    /v_player_one_world\.position_x::bigint/
  );

  assert.match(
    fn,
    /v_player_one_world\.position_y::bigint/
  );

  const freshMarker = fn.indexOf(
    'CANONICAL FRESH RESOLUTION AUTHORITY'
  );

  assert.ok(freshMarker >= 0);

  const fresh = fn.slice(freshMarker);

  assert.doesNotMatch(
    fresh,
    /v_world\.player_(?:one|two)_[xy]/
  );
});

test('segment-event classifier uses mutable terrain not published collision mask', () => {
  const call = fn.match(
    /cing_artillery_classify_segment_event_private_v1\s*\([\s\S]*?\n\s*\);/
  );

  assert.ok(call);

  assert.match(
    call[0],
    /v_terrain\.width_px/
  );

  assert.match(
    call[0],
    /v_terrain\.height_px/
  );

  assert.match(
    call[0],
    /v_terrain\.collision_mask/
  );

  assert.doesNotMatch(
    call[0],
    /v_map\.collision_mask/
  );
});

test('hp depleted terminal precedes crater and returns immediately', () => {
  const hp = fn.indexOf(
    'v_target_post_hp = 0'
  );

  const crater = fn.indexOf(
    'cing_artillery_apply_terrain_crater_private_v1'
  );

  assert.ok(hp > 0);
  assert.ok(crater > hp);

  const hpBranch = fn.slice(
    hp,
    crater
  );

  assert.match(
    hpBranch,
    /cing_artillery_complete_combat_private/
  );

  assert.match(
    hpBranch,
    /RETURN v_resolution;/
  );
});

test('commercial V1 crater applies only to terrain_hit', () => {
  assert.match(
    fn,
    /IF v_resolution\.outcome = 'terrain_hit'\s+THEN[\s\S]*cing_artillery_apply_terrain_crater_private_v1/
  );
});

test('terrain aftermath resolves participant one then participant two', () => {
  const settlement = fn.indexOf(
    'Settlement order V1'
  );

  assert.ok(settlement > 0);

  const one = fn.indexOf(
    'v_combat.player_one_account_id',
    settlement
  );

  const two = fn.indexOf(
    'v_combat.player_two_account_id',
    settlement
  );

  assert.ok(one > settlement);
  assert.ok(two > one);
});

test('each canonical fall terminal stops before turn advancement', () => {
  const settlement = fn.indexOf(
    'Settlement order V1'
  );

  const advance = fn.indexOf(
    'cing_artillery_advance_turn_private',
    settlement
  );

  assert.ok(settlement > 0);
  assert.ok(advance > settlement);

  const aftermath = fn.slice(
    settlement,
    advance
  );

  const fallChecks =
    aftermath.match(
      /= 'fell_out_of_world'[\s\S]*?RETURN v_resolution;/g
    ) || [];

  assert.equal(
    fallChecks.length,
    2
  );
});

test('turn advances exactly after nonterminal settlement', () => {
  const crater = fn.indexOf(
    'cing_artillery_apply_terrain_crater_private_v1'
  );

  const supportTwo = fn.lastIndexOf(
    'cing_artillery_resolve_player_support_private_v1'
  );

  const advance = fn.lastIndexOf(
    'cing_artillery_advance_turn_private'
  );

  assert.ok(crater > 0);
  assert.ok(supportTwo > crater);
  assert.ok(advance > supportTwo);
});

test('settlement never lazy initializes terrain or player world authority', () => {
  assert.doesNotMatch(
    fn,
    /cing_artillery_get_or_create_combat_terrain_private/
  );

  assert.doesNotMatch(
    fn,
    /cing_artillery_get_or_create_player_world_states_private/
  );
});

test('settlement never mutates immutable combat-world spawn authority', () => {
  assert.doesNotMatch(
    fn,
    /UPDATE\s+public\.cing_artillery_combat_world_states/i
  );
});

test('integration preserves fenced SECURITY DEFINER boundary', () => {
  assert.match(
    fn,
    /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = pg_catalog, public/
  );
});

test('migration explicitly revokes all client execute after function replacement', () => {
  assert.match(
    migration,
    /REVOKE ALL[\s\S]*ON FUNCTION[\s\S]*cing_artillery_commit_resolution_fenced_atomic[\s\S]*FROM PUBLIC, anon, authenticated;/
  );
});

test('migration is one atomic transaction', () => {
  assert.equal(
    (migration.match(/\bBEGIN;/g) || []).length,
    1
  );

  assert.equal(
    (migration.match(/\bCOMMIT;/g) || []).length,
    1
  );
});

test('production ACL explicitly denies client roles and preserves service role execution', () => {
  assert.match(
    migration,
    /REVOKE ALL[\s\S]*ON FUNCTION[\s\S]*cing_artillery_commit_resolution_fenced_atomic[\s\S]*FROM PUBLIC, anon, authenticated;/
  );

  assert.match(
    migration,
    /GRANT EXECUTE[\s\S]*ON FUNCTION[\s\S]*cing_artillery_commit_resolution_fenced_atomic[\s\S]*TO service_role;/
  );
});
