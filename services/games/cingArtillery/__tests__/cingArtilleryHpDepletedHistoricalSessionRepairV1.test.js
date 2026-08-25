"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const migration =
  fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../../db/migrations/20260825_cing_artillery_hp_depleted_historical_session_repair_v1.sql"
    ),
    "utf8"
  );

test(
  "repair is explicitly bounded to one historical match",
  () => {
    assert.match(
      migration,
      /cf31412a-540e-4b40-960c-aff080052998/
    );

    assert.match(
      migration,
      /2026-08-25T08:22:13\.177018\+00:00/
    );

    assert.match(
      migration,
      /CING_ARTILLERY_REPAIR_MATCH_FENCE_FAILED/
    );
  }
);

test(
  "repair fences exact winner loser and both participant sessions",
  () => {
    assert.match(
      migration,
      /winner_account_id/
    );

    assert.match(
      migration,
      /loser_account_id/
    );

    assert.match(
      migration,
      /player_one_session_id/
    );

    assert.match(
      migration,
      /player_two_session_id/
    );
  }
);

test(
  "repair requires completed hp-depleted core lifecycle",
  () => {
    assert.match(
      migration,
      /v_match\.status <>[\s\S]*'completed'/
    );

    assert.match(
      migration,
      /v_match\.completion_reason <>[\s\S]*'hp_depleted'/
    );

    assert.match(
      migration,
      /CING_ARTILLERY_REPAIR_RUNTIME_FENCE_FAILED/
    );

    assert.match(
      migration,
      /CING_ARTILLERY_REPAIR_COMBAT_FENCE_FAILED/
    );

    assert.match(
      migration,
      /CING_ARTILLERY_REPAIR_TURN_FENCE_FAILED/
    );
  }
);

test(
  "repair preserves canonical terminal lock order",
  () => {
    const tokens = [
      "FROM public.cing_artillery_combat_states AS c",
      "FROM public.cing_artillery_turn_states AS t",
      "FROM public.cing_artillery_combat_vital_states AS v",
      "FROM public.cing_artillery_match_runtimes AS r",
      "FROM public.cing_artillery_matches AS m",
      "PERFORM s.id\n  FROM public.cing_artillery_gameplay_sessions AS s",
    ];

    const positions =
      tokens.map(
        token =>
          migration.indexOf(token)
      );

    assert.ok(
      positions.every(
        position =>
          position >= 0
      )
    );

    assert.deepEqual(
      positions,
      [...positions].sort(
        (a, b) =>
          a - b
      )
    );

    assert.match(
      migration,
      /ORDER BY s\.id[\s\S]*FOR UPDATE/i
    );
  }
);

test(
  "repair fences canonical vital-state identity and lethal HP",
  () => {
    assert.match(
      migration,
      /CING_ARTILLERY_REPAIR_VITAL_FENCE_FAILED/
    );

    assert.match(
      migration,
      /v_vital\.player_one_current_hp <>[\s\S]*700/
    );

    assert.match(
      migration,
      /v_vital\.player_two_current_hp <>[\s\S]*0/
    );
  }
);

test(
  "repair preserves historical matched-ticket provenance",
  () => {
    assert.match(
      migration,
      /v_ticket_count <> 2/
    );

    assert.doesNotMatch(
      migration,
      /UPDATE\s+public\.cing_artillery_matchmaking_tickets/i
    );

    assert.doesNotMatch(
      migration,
      /DELETE\s+FROM\s+public\.cing_artillery_matchmaking_tickets/i
    );
  }
);

test(
  "repair updates exactly the two gameplay sessions to completed",
  () => {
    const updates =
      migration.match(
        /UPDATE\s+public\.cing_artillery_gameplay_sessions/gi
      ) || [];

    assert.equal(
      updates.length,
      2
    );

    assert.match(
      migration,
      /status\s*=\s*'completed'/
    );

    assert.match(
      migration,
      /ended_at\s*=\s*v_match\.completed_at/
    );
  }
);

test(
  "repair is idempotent only for exact already-repaired state",
  () => {
    assert.match(
      migration,
      /v_session_one\.status =[\s\S]*'completed'[\s\S]*v_session_two\.status =[\s\S]*'completed'/
    );

    assert.match(
      migration,
      /v_session_one\.ended_at =[\s\S]*v_match\.completed_at/
    );

    assert.match(
      migration,
      /v_session_two\.ended_at =[\s\S]*v_match\.completed_at/
    );
  }
);

test(
  "repair owns no unrelated gameplay or rollout mutation",
  () => {
    const forbidden = [
      /UPDATE\s+public\.cing_artillery_matches/i,
      /UPDATE\s+public\.cing_artillery_match_runtimes/i,
      /UPDATE\s+public\.cing_artillery_combat_states/i,
      /UPDATE\s+public\.cing_artillery_turn_states/i,
      /UPDATE\s+public\.app_configs/i,
      /\bgame_plays\b/i,
      /\bpending_rewards\b/i,
      /\bwallet\b/i,
    ];

    for (
      const pattern
      of forbidden
    ) {
      assert.doesNotMatch(
        migration,
        pattern
      );
    }
  }
);

test(
  "repair is one explicit transaction",
  () => {
    assert.match(
      migration,
      /^\s*BEGIN;/i
    );

    assert.match(
      migration,
      /COMMIT;\s*$/i
    );
  }
);
