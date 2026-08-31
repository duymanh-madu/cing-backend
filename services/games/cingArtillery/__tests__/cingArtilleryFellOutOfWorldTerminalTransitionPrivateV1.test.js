const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const migrationPath = path.resolve(
  __dirname,
  "../../../../db/migrations/" +
    "20260831_cing_artillery_fell_out_of_world_terminal_transition_private_v1.sql"
);

const sql = fs.readFileSync(migrationPath, "utf8");

const executableSql = sql
  .replace(/\/\*[\s\S]*?\*\//gu, "")
  .replace(/--[^\r\n]*/gu, "");

test(
  "fall terminal primitive is dedicated and private",
  () => {
    assert.match(
      executableSql,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.cing_artillery_complete_fell_out_of_world_private\s*\(\s*p_combat_state_id\s+uuid\s*,\s*p_turn_state_id\s+uuid\s*,\s*p_expected_turn_number\s+integer\s*,\s*p_fallen_account_id\s+uuid/iu
    );

    assert.doesNotMatch(
      executableSql,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.cing_artillery_complete_combat_private/iu
    );
  }
);

test(
  "fall terminal primitive validates fallen participant and derives opponent winner",
  () => {
    assert.match(
      executableSql,
      /p_fallen_account_id\s*=\s*v_combat\.player_one_account_id/iu
    );

    assert.match(
      executableSql,
      /p_fallen_account_id\s*=\s*v_combat\.player_two_account_id/iu
    );

    assert.match(
      executableSql,
      /CING_ARTILLERY_FALLEN_ACCOUNT_NOT_PARTICIPANT/u
    );

    assert.doesNotMatch(
      executableSql,
      /p_winner_account_id|p_loser_account_id/iu
    );
  }
);

test(
  "fall terminal primitive preserves canonical lock order",
  () => {
    const combat =
      executableSql.indexOf(
        "FROM public.cing_artillery_combat_states AS c"
      );

    const turn =
      executableSql.indexOf(
        "FROM public.cing_artillery_turn_states AS t"
      );

    const vital =
      executableSql.indexOf(
        "FROM public.cing_artillery_combat_vital_states AS v"
      );

    const runtime =
      executableSql.indexOf(
        "FROM public.cing_artillery_match_runtimes AS r"
      );

    const match =
      executableSql.indexOf(
        "FROM public.cing_artillery_matches AS m"
      );

    const sessions =
      executableSql.indexOf(
        "PERFORM s.id"
      );

    assert.ok(combat >= 0);
    assert.ok(combat < turn);
    assert.ok(turn < vital);
    assert.ok(vital < runtime);
    assert.ok(runtime < match);
    assert.ok(match < sessions);

    assert.match(
      executableSql,
      /ORDER\s+BY\s+s\.id\s+FOR\s+UPDATE/iu
    );
  }
);

test(
  "fall terminal primitive does not require lethal HP or mutate HP",
  () => {
    assert.doesNotMatch(
      executableSql,
      /current_hp\s*=\s*0/iu
    );

    assert.doesNotMatch(
      executableSql,
      /UPDATE\s+public\.cing_artillery_combat_vital_states/iu
    );
  }
);

test(
  "fall terminal primitive uses one PostgreSQL terminal timestamp",
  () => {
    assert.equal(
      (
        executableSql.match(
          /clock_timestamp\s*\(\s*\)/giu
        ) || []
      ).length,
      1
    );

    assert.match(
      executableSql,
      /v_completed_at\s*:=\s*clock_timestamp\s*\(\s*\)/iu
    );
  }
);

test(
  "fall terminal primitive completes all canonical lifecycle authorities",
  () => {
    assert.match(
      executableSql,
      /UPDATE\s+public\.cing_artillery_turn_states/iu
    );

    assert.match(
      executableSql,
      /UPDATE\s+public\.cing_artillery_combat_states/iu
    );

    assert.match(
      executableSql,
      /UPDATE\s+public\.cing_artillery_match_runtimes/iu
    );

    assert.match(
      executableSql,
      /UPDATE\s+public\.cing_artillery_matches/iu
    );

    assert.equal(
      (
        executableSql.match(
          /UPDATE\s+public\.cing_artillery_gameplay_sessions/giu
        ) || []
      ).length,
      2
    );
  }
);

test(
  "fall terminal reason is persisted on combat runtime and match",
  () => {
    assert.equal(
      (
        executableSql.match(
          /completion_reason\s*=\s*'fell_out_of_world'/giu
        ) || []
      ).length,
      3
    );
  }
);

test(
  "fall terminal primitive fences every lifecycle mutation",
  () => {
    assert.equal(
      (
        executableSql.match(
          /GET\s+DIAGNOSTICS\s+v_updated_count\s*=\s*ROW_COUNT/giu
        ) || []
      ).length,
      6
    );

    assert.equal(
      (
        executableSql.match(
          /IF\s+v_updated_count\s*<>\s*1\s+THEN/giu
        ) || []
      ).length,
      6
    );
  }
);

test(
  "fall terminal primitive verifies terminal postconditions",
  () => {
    assert.match(
      executableSql,
      /FALL_TERMINAL_COMBAT_POSTCONDITION_FAILED/u
    );

    assert.match(
      executableSql,
      /FALL_TERMINAL_TURN_POSTCONDITION_FAILED/u
    );

    assert.match(
      executableSql,
      /FALL_TERMINAL_RUNTIME_POSTCONDITION_FAILED/u
    );

    assert.match(
      executableSql,
      /FALL_TERMINAL_MATCH_POSTCONDITION_FAILED/u
    );

    assert.match(
      executableSql,
      /FALL_PLAYER_ONE_SESSION_TERMINAL_POSTCONDITION_FAILED/u
    );

    assert.match(
      executableSql,
      /FALL_PLAYER_TWO_SESSION_TERMINAL_POSTCONDITION_FAILED/u
    );
  }
);

test(
  "fall terminal primitive does not redefine projectile out_of_bounds or position authority",
  () => {
    assert.doesNotMatch(
      executableSql,
      /\bout_of_bounds\b/iu
    );

    assert.doesNotMatch(
      executableSql,
      /\bposition_[xy]\b|\bspawn_[xy]\b|\bcollision_mask\b|\btrajectory\b/iu
    );
  }
);

test(
  "fall terminal primitive is closed to application roles",
  () => {
    for (const role of [
      "PUBLIC",
      "anon",
      "authenticated",
      "service_role",
    ]) {
      assert.match(
        executableSql,
        new RegExp(
          String.raw`REVOKE\s+ALL[\s\S]*?cing_artillery_complete_fell_out_of_world_private[\s\S]*?FROM\s+${role}\s*;`,
          "iu"
        )
      );
    }

    assert.doesNotMatch(
      executableSql,
      /\bGRANT\b/iu
    );
  }
);

test(
  "fall terminal migration is one atomic transaction",
  () => {
    assert.equal(
      (
        executableSql.match(/\bBEGIN\s*;/giu) || []
      ).length,
      1
    );

    assert.equal(
      (
        executableSql.match(/\bCOMMIT\s*;/giu) || []
      ).length,
      1
    );
  }
);
