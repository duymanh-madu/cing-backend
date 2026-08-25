"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const MIGRATION =
  path.resolve(
    __dirname,
    "../../../../db/migrations/20260825_cing_artillery_unplayed_match_abandonment_v1.sql"
  );

const sql =
  fs.readFileSync(
    MIGRATION,
    "utf8"
  );

function indexOfOrFail(
  token
) {
  const index =
    sql.indexOf(
      token
    );

  assert.notEqual(
    index,
    -1,
    `missing SQL token: ${token}`
  );

  return index;
}


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
  "terminal status model adds abandoned without replacing hp-depleted completion",
  () => {
    for (const table of [
      "cing_artillery_matches",
      "cing_artillery_match_runtimes",
      "cing_artillery_combat_states",
      "cing_artillery_turn_states",
    ]) {
      assert.match(
        sql,
        new RegExp(
          `ALTER TABLE public\\.${table}[\\s\\S]*?'abandoned'`,
          "iu"
        )
      );
    }

    assert.match(
      sql,
      /status\s*=\s*'completed'[\s\S]*?completion_reason\s*=\s*'hp_depleted'/iu
    );

    assert.match(
      sql,
      /status\s*=\s*'abandoned'[\s\S]*?winner_account_id\s+IS\s+NULL[\s\S]*?loser_account_id\s+IS\s+NULL[\s\S]*?completion_reason\s*=\s*'abandoned'/iu
    );
  }
);


test(
  "canonical RPC is narrowly scoped to unplayed match abandonment",
  () => {
    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION\s+public\.cing_artillery_abandon_unplayed_match_atomic_v1\s*\(\s*p_match_id uuid\s*\)/iu
    );

    assert.match(
      sql,
      /CING_ARTILLERY_MATCH_ALREADY_PLAYED/u
    );

    assert.match(
      sql,
      /public\.cing_artillery_shot_commands/iu
    );

    assert.match(
      sql,
      /public\.cing_artillery_shot_executions/iu
    );

    assert.match(
      sql,
      /public\.cing_artillery_shot_resolutions/iu
    );

    assert.match(
      sql,
      /rules_snapshot[\s\S]*?max_hp/iu
    );

    assert.match(
      sql,
      /CING_ARTILLERY_UNPLAYED_HP_STATE_INVALID/u
    );
  }
);


test(
  "abandonment preserves canonical gameplay lock order",
  () => {
    const combat =
      indexOfOrFail(
        "FROM public.cing_artillery_combat_states AS c"
      );

    const turn =
      indexOfOrFail(
        "FROM public.cing_artillery_turn_states AS t"
      );

    const vital =
      indexOfOrFail(
        "FROM public.cing_artillery_combat_vital_states AS v"
      );

    const runtime =
      indexOfOrFail(
        "FROM public.cing_artillery_match_runtimes AS r"
      );

    const match =
      indexOfOrFail(
        "FROM public.cing_artillery_matches AS m"
      );

    const sessionOne =
      indexOfOrFail(
        "INTO v_session_one"
      );

    const sessionTwo =
      indexOfOrFail(
        "INTO v_session_two"
      );

    assert.ok(
      combat < turn
    );

    assert.ok(
      turn < vital
    );

    assert.ok(
      vital < runtime
    );

    assert.ok(
      runtime < match
    );

    assert.ok(
      match < sessionOne
    );

    assert.ok(
      sessionOne < sessionTwo
    );
  }
);


test(
  "exact retry requires complete abandoned state agreement",
  () => {
    assert.match(
      sql,
      /IF v_match\.status\s*=\s*'abandoned'[\s\S]*?CING_ARTILLERY_ABANDON_RETRY_INCONSISTENT/iu
    );

    assert.match(
      sql,
      /v_runtime\.status\s*<>\s*'abandoned'/iu
    );

    assert.match(
      sql,
      /v_combat\.status\s*<>\s*'abandoned'/iu
    );

    assert.match(
      sql,
      /v_turn\.status\s*<>\s*'abandoned'/iu
    );

    assert.match(
      sql,
      /v_session_one\.status\s*<>\s*'abandoned'/iu
    );

    assert.match(
      sql,
      /v_session_two\.status\s*<>\s*'abandoned'/iu
    );
  }
);


test(
  "one timestamp terminalizes turn combat runtime match and sessions",
  () => {
    assert.match(
      sql,
      /v_terminal_at\s*:=\s*clock_timestamp\(\)/iu
    );

    const writes =
      sql.match(
        /=\s*v_terminal_at/giu
      ) || [];

    assert.ok(
      writes.length >= 10,
      "expected single terminal timestamp to be reused across durable lifecycle"
    );
  }
);


test(
  "turn abandonment makes expired-turn worker ineligible",
  () => {
    assert.match(
      sql,
      /UPDATE public\.cing_artillery_turn_states[\s\S]*?status\s*=\s*'abandoned'/iu
    );

    assert.match(
      sql,
      /active_account_id\s*=\s*NULL/iu
    );

    assert.match(
      sql,
      /active_session_id\s*=\s*NULL/iu
    );

    assert.match(
      sql,
      /turn_started_at\s*=\s*NULL/iu
    );

    assert.match(
      sql,
      /turn_deadline_at\s*=\s*NULL/iu
    );
  }
);


test(
  "both gameplay sessions become abandoned atomically",
  () => {
    assert.match(
      sql,
      /UPDATE public\.cing_artillery_gameplay_sessions[\s\S]*?status\s*=\s*'abandoned'[\s\S]*?ended_at\s*=\s*v_terminal_at/iu
    );

    assert.match(
      sql,
      /CING_ARTILLERY_ABANDON_SESSION_UPDATE_CONFLICT/u
    );

    assert.match(
      sql,
      /v_updated_count\s*<>\s*2/iu
    );
  }
);


test(
  "historical matched matchmaking tickets are preserved",
  () => {
    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_matchmaking_tickets/iu
    );

    assert.doesNotMatch(
      sql,
      /DELETE\s+FROM\s+public\.cing_artillery_matchmaking_tickets/iu
    );
  }
);


test(
  "RPC is service-role only",
  () => {
    for (const role of [
      "PUBLIC",
      "anon",
      "authenticated",
    ]) {
      assert.match(
        sql,
        new RegExp(
          `REVOKE ALL ON FUNCTION[\\s\\S]*?cing_artillery_abandon_unplayed_match_atomic_v1[\\s\\S]*?FROM ${role}\\s*;`,
          "iu"
        )
      );
    }

    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION[\s\S]*?cing_artillery_abandon_unplayed_match_atomic_v1[\s\S]*?TO service_role\s*;/iu
    );
  }
);


test(
  "migration does not add public transport or rewrite matchmaking history",
  () => {
    assert.doesNotMatch(
      sql,
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.[^(]*matchmaking/iu
    );

    assert.doesNotMatch(
      sql,
      /INSERT\s+INTO\s+public\.cing_artillery_matchmaking_tickets/iu
    );
  }
);
