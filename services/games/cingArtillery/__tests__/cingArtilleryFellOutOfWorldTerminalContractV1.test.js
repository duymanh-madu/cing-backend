const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const migrationPath = path.resolve(
  __dirname,
  "../../../../db/migrations/" +
    "20260831_cing_artillery_fell_out_of_world_terminal_contract_v1.sql"
);

const sql = fs.readFileSync(migrationPath, "utf8");

const executableSql = sql
  .replace(/\/\*[\s\S]*?\*\//gu, "")
  .replace(/--[^\r\n]*/gu, "");

test(
  "5J4C extends exactly three completed terminal reason predicates",
  () => {
    const predicates =
      executableSql.match(
        /completion_reason\s+IN\s*\(\s*'hp_depleted'\s*,\s*'fell_out_of_world'\s*\)/giu
      ) || [];

    assert.equal(predicates.length, 3);
  }
);

test(
  "5J4C replaces the exact existing terminal lifecycle constraints",
  () => {
    const constraints = [
      "cing_artillery_matches_terminal_lifecycle_check",
      "cing_artillery_match_runtimes_terminal_lifecycle_check",
      "cing_artillery_combat_states_terminal_lifecycle_check",
    ];

    for (const constraint of constraints) {
      const escaped =
        constraint.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

      assert.match(
        executableSql,
        new RegExp(
          String.raw`DROP\s+CONSTRAINT\s+${escaped}`,
          "iu"
        )
      );

      assert.match(
        executableSql,
        new RegExp(
          String.raw`ADD\s+CONSTRAINT\s+${escaped}`,
          "iu"
        )
      );
    }

    assert.doesNotMatch(
      executableSql,
      /terminal_contract_check/iu
    );
  }
);

test(
  "5J4C preserves abandoned lifecycle on all three authorities",
  () => {
    const abandonedStatuses =
      executableSql.match(
        /status\s*=\s*'abandoned'/giu
      ) || [];

    const abandonedReasons =
      executableSql.match(
        /completion_reason\s*=\s*'abandoned'/giu
      ) || [];

    assert.equal(abandonedStatuses.length, 3);
    assert.equal(abandonedReasons.length, 3);
  }
);

test(
  "5J4C preserves canonical terminal timestamp ordering",
  () => {
    const matchedGuards =
      executableSql.match(
        /completed_at\s*>=\s*matched_at/giu
      ) || [];

    const initializedGuards =
      executableSql.match(
        /completed_at\s*>=\s*initialized_at/giu
      ) || [];

    assert.equal(
      matchedGuards.length,
      2,
      "match completed and abandoned branches must preserve matched_at ordering"
    );

    assert.equal(
      initializedGuards.length,
      4,
      "runtime/combat completed and abandoned branches must preserve initialized_at ordering"
    );
  }
);

test(
  "5J4C preserves winner and loser terminal invariants",
  () => {
    const winnerRequired =
      executableSql.match(
        /winner_account_id\s+IS\s+NOT\s+NULL/giu
      ) || [];

    const loserRequired =
      executableSql.match(
        /loser_account_id\s+IS\s+NOT\s+NULL/giu
      ) || [];

    const distinctRequired =
      executableSql.match(
        /winner_account_id\s*<>\s*loser_account_id/giu
      ) || [];

    assert.equal(winnerRequired.length, 3);
    assert.equal(loserRequired.length, 3);
    assert.equal(distinctRequired.length, 3);
  }
);

test(
  "5J4C preserves player identity pairing on all authorities",
  () => {
    const p1Winner =
      executableSql.match(
        /winner_account_id\s*=\s*player_one_account_id/giu
      ) || [];

    const p2Winner =
      executableSql.match(
        /winner_account_id\s*=\s*player_two_account_id/giu
      ) || [];

    assert.equal(p1Winner.length, 3);
    assert.equal(p2Winner.length, 3);
  }
);

test(
  "5J4C does not redefine projectile out_of_bounds",
  () => {
    assert.doesNotMatch(
      executableSql,
      /\bout_of_bounds\b/iu
    );
  }
);

test(
  "5J4C does not introduce premature position or physics authority",
  () => {
    assert.doesNotMatch(
      executableSql,
      /\bposition_[xy]\b|\bspawn_[xy]\b|\bcollision_mask\b|\btrajectory\b/iu
    );
  }
);

test(
  "5J4C migration is one atomic transaction",
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
