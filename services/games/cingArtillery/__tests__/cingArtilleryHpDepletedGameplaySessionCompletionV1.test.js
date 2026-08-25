"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const migrationPath =
  path.resolve(
    __dirname,
    "../../../../db/migrations/20260825_cing_artillery_hp_depleted_gameplay_session_completion_v1.sql"
  );

const sql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

test(
  "hp-depleted terminal transition completes both gameplay sessions",
  () => {
    assert.match(
      sql,
      /PERFORM\s+s\.id[\s\S]*?FROM\s+public\.cing_artillery_gameplay_sessions[\s\S]*?ORDER\s+BY\s+s\.id[\s\S]*?FOR\s+UPDATE/iu
    );

    assert.match(
      sql,
      /v_session_one\.status\s*<>\s*'active'/iu
    );

    assert.match(
      sql,
      /v_session_two\.status\s*<>\s*'active'/iu
    );

    const updates =
      sql.match(
        /UPDATE\s+public\.cing_artillery_gameplay_sessions[\s\S]*?status\s*=\s*'completed'[\s\S]*?ended_at\s*=\s*v_completed_at/giu
      ) || [];

    assert.equal(
      updates.length,
      2
    );
  }
);

test(
  "all hp-depleted lifecycle rows reuse one PostgreSQL terminal timestamp",
  () => {
    assert.match(
      sql,
      /v_completed_at\s*:=\s*clock_timestamp\(\)/iu
    );

    assert.match(
      sql,
      /UPDATE\s+public\.cing_artillery_turn_states[\s\S]*?completed_at\s*=\s*v_completed_at/iu
    );

    assert.match(
      sql,
      /UPDATE\s+public\.cing_artillery_combat_states[\s\S]*?completed_at\s*=\s*v_completed_at/iu
    );

    assert.match(
      sql,
      /UPDATE\s+public\.cing_artillery_match_runtimes[\s\S]*?completed_at\s*=\s*v_completed_at/iu
    );

    assert.match(
      sql,
      /UPDATE\s+public\.cing_artillery_matches[\s\S]*?completed_at\s*=\s*v_completed_at/iu
    );

    const sessionEndedAt =
      sql.match(
        /ended_at\s*=\s*v_completed_at/giu
      ) || [];

    assert.ok(
      sessionEndedAt.length >= 2
    );
  }
);

test(
  "gameplay-session completion is inside canonical complete-combat transaction",
  () => {
    const functionStart =
      sql.indexOf(
        "CREATE OR REPLACE FUNCTION\n  public.cing_artillery_complete_combat_private"
      );

    const functionEnd =
      sql.indexOf(
        "$$;",
        functionStart
      );

    const firstSessionUpdate =
      sql.indexOf(
        "UPDATE public.cing_artillery_gameplay_sessions",
        functionStart
      );

    assert.ok(
      functionStart >= 0
    );

    assert.ok(
      functionEnd >
        functionStart
    );

    assert.ok(
      firstSessionUpdate >
        functionStart
    );

    assert.ok(
      firstSessionUpdate <
        functionEnd
    );
  }
);

test(
  "terminal postconditions verify both completed session identities and timestamps",
  () => {
    assert.match(
      sql,
      /CING_ARTILLERY_PLAYER_ONE_SESSION_TERMINAL_POSTCONDITION_FAILED/iu
    );

    assert.match(
      sql,
      /CING_ARTILLERY_PLAYER_TWO_SESSION_TERMINAL_POSTCONDITION_FAILED/iu
    );

    assert.match(
      sql,
      /v_session_one\.ended_at\s*<>\s*v_completed_at/iu
    );

    assert.match(
      sql,
      /v_session_two\.ended_at\s*<>\s*v_completed_at/iu
    );
  }
);

test(
  "historical matched tickets are not mutated by hp-depleted completion",
  () => {
    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_matchmaking_tickets/iu
    );
  }
);

test(
  "private terminal primitive remains closed to application roles",
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
      const pattern =
        new RegExp(
          String.raw`REVOKE\s+ALL[\s\S]*?ON\s+FUNCTION\s+public\.cing_artillery_complete_combat_private\([\s\S]*?\)[\s\S]*?FROM\s+${role}\s*;`,
          "iu"
        );

      assert.match(
        sql,
        pattern
      );
    }
  }
);
