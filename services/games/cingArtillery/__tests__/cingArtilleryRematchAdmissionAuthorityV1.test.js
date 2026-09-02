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
    "../../../../supabase/migrations/" +
      "20260902080000_cing_artillery_rematch_admission_authority_v1.sql"
  );

const sql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

test(
  "rematch admission requires canonical completed source match",
  () => {
    assert.match(
      sql,
      /FROM public\.cing_artillery_matches AS m[\s\S]*?WHERE m\.id = p_source_match_id[\s\S]*?FOR UPDATE/iu
    );

    assert.match(
      sql,
      /v_match\.status <> 'completed'/iu
    );

    assert.match(
      sql,
      /v_match\.completed_at IS NULL/iu
    );
  }
);

test(
  "rematch admission derives source session only from canonical participant slot",
  () => {
    assert.match(
      sql,
      /v_match\.player_one_account_id\s*=\s*p_account_id[\s\S]*?v_source_session_id\s*:=\s*v_match\.player_one_session_id/iu
    );

    assert.match(
      sql,
      /v_match\.player_two_account_id\s*=\s*p_account_id[\s\S]*?v_source_session_id\s*:=\s*v_match\.player_two_session_id/iu
    );

    assert.match(
      sql,
      /CING_ARTILLERY_REMATCH_NOT_PARTICIPANT/iu
    );
  }
);

test(
  "rematch admission requires terminal historical source session",
  () => {
    assert.match(
      sql,
      /FROM public\.cing_artillery_gameplay_sessions AS s[\s\S]*?WHERE s\.id = v_source_session_id[\s\S]*?AND s\.account_id = p_account_id[\s\S]*?FOR UPDATE/iu
    );

    assert.match(
      sql,
      /v_source_session\.status NOT IN\s*\(\s*'completed'\s*,\s*'abandoned'\s*\)/iu
    );
  }
);

test(
  "rematch serializes admission on active artillery account",
  () => {
    assert.match(
      sql,
      /FROM public\.cing_artillery_accounts AS a[\s\S]*?WHERE a\.id = p_account_id[\s\S]*?AND a\.status = 'active'[\s\S]*?FOR UPDATE/iu
    );
  }
);

test(
  "rematch admission requires canonical effective gameplay access",
  () => {
    assert.match(
      sql,
      /cing_artillery_account_has_effective_gameplay_access_private_v1\s*\(\s*p_account_id\s*\)/iu
    );

    assert.match(
      sql,
      /MESSAGE\s*=\s*'cing_artillery_disabled'/iu
    );
  }
);

test(
  "repeated rematch recovers existing active gameplay session",
  () => {
    assert.match(
      sql,
      /WHERE s\.account_id = p_account_id[\s\S]*?AND s\.status = 'active'/iu
    );

    assert.match(
      sql,
      /IF FOUND THEN\s*RETURN v_active_session/iu
    );
  }
);

test(
  "rematch creates only a new active gameplay session",
  () => {
    assert.match(
      sql,
      /INSERT INTO\s+public\.cing_artillery_gameplay_sessions/iu
    );

    assert.match(
      sql,
      /'active'/iu
    );

    assert.doesNotMatch(
      sql,
      /INSERT INTO\s+public\.cing_artillery_matches/iu
    );

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
  "rematch authority preserves historical match and ticket provenance",
  () => {
    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_matches/iu
    );

    assert.doesNotMatch(
      sql,
      /DELETE\s+FROM\s+public\.cing_artillery_matches/iu
    );

    assert.doesNotMatch(
      sql,
      /DELETE\s+FROM\s+public\.cing_artillery_gameplay_sessions/iu
    );
  }
);

test(
  "rematch admission authority is service-role-only",
  () => {
    for (
      const role
      of [
        "PUBLIC",
        "anon",
        "authenticated",
      ]
    ) {
      assert.match(
        sql,
        new RegExp(
          `REVOKE ALL[\\s\\S]*?` +
          `cing_artillery_create_rematch_gameplay_session_atomic_v1` +
          `[\\s\\S]*?FROM ${role}`,
          "iu"
        )
      );
    }

    assert.match(
      sql,
      /GRANT EXECUTE[\s\S]*?cing_artillery_create_rematch_gameplay_session_atomic_v1[\s\S]*?TO service_role/iu
    );
  }
);
