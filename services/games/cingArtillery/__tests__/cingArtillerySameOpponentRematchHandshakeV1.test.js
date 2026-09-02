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
      "20260902083000_cing_artillery_same_opponent_rematch_handshake_v1.sql"
  );

const sql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

test(
  "rematch handshake is keyed by canonical source match",
  () => {
    assert.match(
      sql,
      /source_match_id uuid PRIMARY KEY[\s\S]*?REFERENCES public\.cing_artillery_matches\(id\)/iu
    );

    assert.match(
      sql,
      /WHERE m\.id = p_source_match_id[\s\S]*?FOR UPDATE/iu
    );
  }
);

test(
  "source match must be completed and caller must be participant",
  () => {
    assert.match(
      sql,
      /v_match\.status <> 'completed'/iu
    );

    assert.match(
      sql,
      /v_match\.completed_at IS NULL/iu
    );

    assert.match(
      sql,
      /p_account_id NOT IN\s*\(\s*v_match\.player_one_account_id\s*,\s*v_match\.player_two_account_id\s*\)/iu
    );

    assert.match(
      sql,
      /CING_ARTILLERY_REMATCH_NOT_PARTICIPANT/iu
    );
  }
);

test(
  "first consent creates no session ticket or match",
  () => {
    const start =
      sql.indexOf(
        "First consent is durable"
      );

    const end =
      sql.indexOf(
        "Mutual consent now exists",
        start
      );

    assert.ok(
      start >= 0 &&
      end > start
    );

    const block =
      sql.slice(
        start,
        end
      );

    assert.match(
      block,
      /RETURN QUERY/iu
    );

    assert.doesNotMatch(
      block,
      /INSERT INTO\s+public\.cing_artillery_gameplay_sessions/iu
    );

    assert.doesNotMatch(
      block,
      /INSERT INTO\s+public\.cing_artillery_matches/iu
    );

    assert.doesNotMatch(
      block,
      /INSERT INTO\s+public\.cing_artillery_matchmaking_tickets/iu
    );
  }
);

test(
  "mutual consent rechecks effective access for both participants",
  () => {
    assert.match(
      sql,
      /cing_artillery_account_has_effective_gameplay_access_private_v1\s*\(\s*v_match\.player_one_account_id\s*\)/iu
    );

    assert.match(
      sql,
      /cing_artillery_account_has_effective_gameplay_access_private_v1\s*\(\s*v_match\.player_two_account_id\s*\)/iu
    );

    assert.match(
      sql,
      /CING_ARTILLERY_REMATCH_PARTICIPANT_ACCESS_REVOKED/iu
    );
  }
);

test(
  "rematch refuses unrelated active gameplay sessions",
  () => {
    assert.match(
      sql,
      /s\.account_id\s*=\s*v_match\.player_one_account_id[\s\S]*?s\.status = 'active'/iu
    );

    assert.match(
      sql,
      /s\.account_id\s*=\s*v_match\.player_two_account_id[\s\S]*?s\.status = 'active'/iu
    );

    assert.match(
      sql,
      /CING_ARTILLERY_REMATCH_ACTIVE_SESSION_CONFLICT/iu
    );
  }
);

test(
  "rematch refuses normal waiting matchmaking tickets",
  () => {
    assert.match(
      sql,
      /cing_artillery_matchmaking_tickets[\s\S]*?t\.status = 'waiting'/iu
    );

    assert.match(
      sql,
      /CING_ARTILLERY_REMATCH_WAITING_TICKET_CONFLICT/iu
    );
  }
);

test(
  "mutual consent creates exactly two fresh active gameplay sessions",
  () => {
    const inserts =
      sql.match(
        /INSERT INTO\s+public\.cing_artillery_gameplay_sessions/giu
      ) || [];

    assert.equal(
      inserts.length,
      2
    );

    assert.match(
      sql,
      /v_match\.player_one_account_id[\s\S]*?'active'/iu
    );

    assert.match(
      sql,
      /v_match\.player_two_account_id[\s\S]*?'active'/iu
    );
  }
);

test(
  "new match preserves exact canonical opponent pair",
  () => {
    assert.match(
      sql,
      /INSERT INTO\s+public\.cing_artillery_matches[\s\S]*?v_match\.player_one_account_id[\s\S]*?v_player_one_new_session\.id[\s\S]*?v_match\.player_two_account_id[\s\S]*?v_player_two_new_session\.id[\s\S]*?'matched'/iu
    );
  }
);

test(
  "rematch writes exactly two matched provenance tickets",
  () => {
    const insertStart =
      sql.search(
        /INSERT INTO\s+public\.cing_artillery_matchmaking_tickets/iu
      );

    assert.ok(
      insertStart >= 0
    );

    const insertEnd =
      sql.indexOf(
        ";",
        insertStart
      );

    assert.ok(
      insertEnd >
        insertStart
    );

    const ticketInsert =
      sql.slice(
        insertStart,
        insertEnd + 1
      );

    const matchedValues =
      ticketInsert.match(
        /'matched'/gu
      ) || [];

    assert.equal(
      matchedValues.length,
      2
    );

    assert.doesNotMatch(
      ticketInsert,
      /'waiting'/iu
    );

    assert.match(
      ticketInsert,
      /v_player_one_new_session\.id/iu
    );

    assert.match(
      ticketInsert,
      /v_player_two_new_session\.id/iu
    );

    assert.match(
      ticketInsert,
      /v_rematch\.id/iu
    );
  }
);

test(
  "successful handshake is idempotent",
  () => {
    assert.match(
      sql,
      /IF v_handshake\.status = 'matched' THEN[\s\S]*?RETURN QUERY[\s\S]*?v_handshake\.rematch_match_id/iu
    );

    assert.match(
      sql,
      /cing_artillery_rematch_handshakes_rematch_match_uidx/iu
    );
  }
);

test(
  "historical source authority is immutable",
  () => {
    for (const forbidden of [
      /UPDATE\s+public\.cing_artillery_matches\s+AS\s+m/iu,
      /DELETE\s+FROM\s+public\.cing_artillery_matches/iu,
      /UPDATE\s+public\.cing_artillery_gameplay_sessions\s+AS\s+s/iu,
      /DELETE\s+FROM\s+public\.cing_artillery_gameplay_sessions/iu,
      /UPDATE\s+public\.cing_artillery_matchmaking_tickets/iu,
      /DELETE\s+FROM\s+public\.cing_artillery_matchmaking_tickets/iu,
    ]) {
      assert.doesNotMatch(
        sql,
        forbidden
      );
    }
  }
);

test(
  "standalone D3B session RPC is closed after handshake becomes canonical",
  () => {
    assert.match(
      sql,
      /REVOKE ALL[\s\S]*?cing_artillery_create_rematch_gameplay_session_atomic_v1[\s\S]*?FROM service_role/iu
    );
  }
);

test(
  "handshake write authority is service-role RPC only",
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
          "REVOKE ALL[\\s\\S]*?" +
          "cing_artillery_request_same_opponent_rematch_atomic_v1" +
          "[\\s\\S]*?FROM " +
          role,
          "iu"
        )
      );
    }

    assert.match(
      sql,
      /GRANT EXECUTE[\s\S]*?cing_artillery_request_same_opponent_rematch_atomic_v1[\s\S]*?TO service_role/iu
    );
  }
);

test(
  "handshake table exposes no application-role writes",
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
          "REVOKE ALL[\\s\\S]*?" +
          "cing_artillery_rematch_handshakes" +
          "[\\s\\S]*?FROM " +
          role,
          "iu"
        )
      );
    }

    assert.match(
      sql,
      /GRANT SELECT[\s\S]*?cing_artillery_rematch_handshakes[\s\S]*?TO service_role/iu
    );
  }
);
