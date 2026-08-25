"use strict";

const test =
  require(
    "node:test"
  );

const assert =
  require(
    "node:assert/strict"
  );

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );

const MIGRATION =
  path.resolve(
    __dirname,
    "../../../../db/migrations/20260825_z_cing_artillery_unplayed_timeout_abandonment_v1.sql"
  );

const sql =
  fs.readFileSync(
    MIGRATION,
    "utf8"
  );


test(
  "migration is one atomic transaction",
  () => {
    assert.match(
      sql,
      /^\s*BEGIN\s*;/iu
    );

    assert.match(
      sql,
      /COMMIT\s*;\s*$/iu
    );
  }
);


test(
  "expired-turn authority abandons only after both players had an opportunity",
  () => {
    assert.match(
      sql,
      /v_turn\.turn_number\s*>=\s*2/iu
    );

    const abandonment =
      sql.indexOf(
        "cing_artillery_abandon_unplayed_match_atomic_v1"
      );

    const advancement =
      sql.indexOf(
        "cing_artillery_advance_turn_private",
        abandonment
      );

    assert.ok(
      abandonment >= 0 &&
      advancement > abandonment
    );
  }
);


test(
  "unplayed branch requires zero accepted shots across canonical combat",
  () => {
    assert.match(
      sql,
      /NOT EXISTS\s*\([\s\S]*?FROM\s+public\.cing_artillery_shot_commands\s+AS\s+s[\s\S]*?s\.combat_state_id\s*=\s*v_combat\.id/iu
    );
  }
);


test(
  "unplayed timeout delegates terminal mutation to canonical abandonment authority",
  () => {
    assert.match(
      sql,
      /PERFORM\s+public\.cing_artillery_abandon_unplayed_match_atomic_v1\s*\(\s*v_combat\.match_id\s*\)/iu
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_matches/iu
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_match_runtimes/iu
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_combat_states/iu
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_turn_states/iu
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_gameplay_sessions/iu
    );
  }
);


test(
  "one missed first turn still uses canonical turn advancement",
  () => {
    assert.match(
      sql,
      /public\.cing_artillery_advance_turn_private\s*\(\s*v_combat\.id,\s*v_turn\.id,\s*v_turn\.turn_number\s*\)/iu
    );
  }
);


test(
  "accepted shot still wins over timeout before abandonment decision",
  () => {
    const currentTurnShotFence =
      sql.indexOf(
        "Accepted-shot ownership wins over timeout"
      );

    const abandonFence =
      sql.indexOf(
        "UNPLAYED LIFECYCLE BOUND"
      );

    assert.ok(
      currentTurnShotFence >= 0 &&
      abandonFence > currentTurnShotFence
    );
  }
);


test(
  "timeout authority remains service-role-only",
  () => {
    for (
      const role
      of [
        "PUBLIC",
        "anon",
        "authenticated",
        "service_role",
      ]
    ) {
      assert.match(
        sql,
        new RegExp(
          String.raw`REVOKE ALL[\s\S]*?cing_artillery_advance_expired_turns_atomic[\s\S]*?FROM ${role}`,
          "iu"
        )
      );
    }

    assert.match(
      sql,
      /GRANT EXECUTE[\s\S]*?cing_artillery_advance_expired_turns_atomic[\s\S]*?TO service_role/iu
    );
  }
);


test(
  "migration does not alter rollout or unrelated domains",
  () => {
    for (
      const forbidden
      of [
        /UPDATE\s+public\.app_configs/iu,
        /INSERT\s+INTO\s+public\.cing_artillery_private_beta_access/iu,
        /\bgame_plays\b/iu,
        /\bpending_rewards\b/iu,
        /\bwallet\b/iu,
        /\bLISTEN\b/iu,
        /\bNOTIFY\b/iu,
        /\bpg_notify\s*\(/iu,
      ]
    ) {
      assert.doesNotMatch(
        sql,
        forbidden
      );
    }
  }
);
