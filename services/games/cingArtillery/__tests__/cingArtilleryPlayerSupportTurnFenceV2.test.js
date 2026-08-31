const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const migrationPath = path.resolve(
  __dirname,
  '../../../../db/migrations/20260831_zzz_cing_artillery_player_support_turn_fence_v2.sql'
);

const sql = fs.readFileSync(migrationPath, 'utf8');

test('support V2 replaces the existing resolver without changing its signature', () => {
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION\s+public\.cing_artillery_resolve_player_support_private_v1\s*\(\s*p_combat_state_id uuid,\s*p_turn_state_id uuid,\s*p_expected_turn_number integer,\s*p_account_id uuid\s*\)/s
  );
});

test('support V2 validates positive expected turn number', () => {
  assert.match(
    sql,
    /p_expected_turn_number IS NULL\s+OR p_expected_turn_number <= 0/s
  );
});

test('support V2 locks canonical turn after combat', () => {
  const combatLock = sql.indexOf(
    'FROM public.cing_artillery_combat_states AS c'
  );
  const turnLock = sql.indexOf(
    'FROM public.cing_artillery_turn_states AS t'
  );

  assert.ok(combatLock >= 0);
  assert.ok(turnLock > combatLock);

  assert.match(
    sql,
    /FROM public\.cing_artillery_turn_states AS t[\s\S]*?WHERE t\.id = p_turn_state_id[\s\S]*?FOR UPDATE;/
  );
});

test('support V2 fences complete combat and turn identity', () => {
  for (const predicate of [
    'v_turn.combat_state_id <>',
    'v_turn.match_runtime_id <>',
    'v_turn.match_id <>',
    'v_turn.player_one_account_id <>',
    'v_turn.player_one_session_id <>',
    'v_turn.player_two_account_id <>',
    'v_turn.player_two_session_id <>',
  ]) {
    assert.ok(
      sql.includes(predicate),
      `missing identity fence: ${predicate}`
    );
  }
});

test('support V2 requires exact active turn lifecycle', () => {
  assert.match(sql, /v_turn\.status <> 'active'/);
  assert.match(
    sql,
    /v_turn\.turn_number <>\s*p_expected_turn_number/s
  );
  assert.match(sql, /v_turn\.active_account_id IS NULL/);
  assert.match(sql, /v_turn\.active_session_id IS NULL/);
  assert.match(
    sql,
    /v_turn\.initiative_reason NOT IN\s*\(\s*'speed',\s*'speed_tiebreak'\s*\)/s
  );
  assert.match(sql, /v_turn\.turn_started_at IS NULL/);
  assert.match(sql, /v_turn\.turn_deadline_at IS NULL/);
});

test('turn fence occurs before supported and landed mutation paths', () => {
  const turnFence = sql.indexOf(
    'CING_ARTILLERY_PLAYER_SUPPORT_TURN_STATE_CONFLICT'
  );
  const supportEvaluation = sql.indexOf(
    'v_supported :='
  );
  const landingMutation = sql.indexOf(
    'position_y = v_landing_y'
  );

  assert.ok(turnFence >= 0);
  assert.ok(supportEvaluation > turnFence);
  assert.ok(landingMutation > turnFence);
});

test('support V2 keeps fall terminal delegation behind the same turn fence', () => {
  const turnFence = sql.indexOf(
    'CING_ARTILLERY_PLAYER_SUPPORT_TURN_STATE_CONFLICT'
  );
  const terminal = sql.indexOf(
    'public.cing_artillery_complete_fell_out_of_world_private('
  );

  assert.ok(turnFence >= 0);
  assert.ok(terminal > turnFence);

  assert.match(
    sql,
    /cing_artillery_complete_fell_out_of_world_private\s*\(\s*p_combat_state_id,\s*p_turn_state_id,\s*p_expected_turn_number,\s*p_account_id\s*\)/s
  );
});

test('support V2 makes downward scan explicitly bottom-safe', () => {
  assert.match(
    sql,
    /IF v_player\.position_y <\s*\(v_terrain\.height_px - 1\)\s*THEN[\s\S]*?FOR v_scan_y IN[\s\S]*?\(v_player\.position_y \+ 1\)[\s\S]*?\(v_terrain\.height_px - 1\)/s
  );
});

test('support V2 preserves immutable spawn authority and does not mutate HP', () => {
  assert.doesNotMatch(
    sql,
    /UPDATE\s+public\.cing_artillery_combat_world_states/i
  );
  assert.doesNotMatch(
    sql,
    /UPDATE\s+public\.cing_artillery_combat_vital_states/i
  );
});

test('support V2 remains private to application roles', () => {
  assert.match(
    sql,
    /REVOKE ALL[\s\S]*?cing_artillery_resolve_player_support_private_v1[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/s
  );
  assert.doesNotMatch(sql, /SECURITY DEFINER/i);
});

test('support V2 migration is atomic', () => {
  assert.match(sql, /^\s*BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
});
