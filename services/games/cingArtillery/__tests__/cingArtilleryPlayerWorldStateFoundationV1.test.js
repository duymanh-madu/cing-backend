"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");


const migrationPath =
  path.resolve(
    __dirname,
    "../../../../db/migrations/" +
      "20260831_cing_artillery_player_world_state_foundation_v1.sql"
  );

const sql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );


test(
  "player world state is separate from immutable combat-world spawn authority",
  () => {
    assert.match(
      sql,
      /CREATE TABLE\s+public\.cing_artillery_player_world_states/
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_combat_world_states/i
    );

    assert.match(
      sql,
      /v_world\.player_one_x/
    );

    assert.match(
      sql,
      /v_world\.player_one_y/
    );

    assert.match(
      sql,
      /v_world\.player_two_x/
    );

    assert.match(
      sql,
      /v_world\.player_two_y/
    );
  }
);


test(
  "player world state owns exactly two canonical participant slots",
  () => {
    assert.match(
      sql,
      /participant_slot IN \(1, 2\)/
    );

    assert.match(
      sql,
      /combat_state_id,\s*participant_slot/
    );

    assert.match(
      sql,
      /combat_state_id,\s*account_id/
    );

    assert.match(
      sql,
      /gameplay_session_id/
    );
  }
);


test(
  "runtime position is integer ground-contact authority",
  () => {
    assert.match(
      sql,
      /position_x integer NOT NULL/
    );

    assert.match(
      sql,
      /position_y integer NOT NULL/
    );

    assert.match(
      sql,
      /position_x >= 0\s+AND position_y >= 0/
    );

    assert.doesNotMatch(
      sql,
      /double precision|real/i
    );
  }
);


test(
  "motion lifecycle begins stable and reserves falling without terminalizing locally",
  () => {
    assert.match(
      sql,
      /motion_state IN \(\s*'stable',\s*'falling'\s*\)/
    );

    assert.doesNotMatch(
      sql,
      /completion_reason\s*=/
    );

    assert.doesNotMatch(
      sql,
      /cing_artillery_complete_fell_out_of_world_private\s*\(/
    );
  }
);


test(
  "initialization accepts no caller coordinates",
  () => {
    const signature =
      sql.match(
        /cing_artillery_get_or_create_player_world_states_private\s*\(([\s\S]*?)\)\s*RETURNS SETOF/
      );

    assert.ok(signature);

    assert.match(
      signature[1],
      /p_combat_state_id uuid/
    );

    assert.doesNotMatch(
      signature[1],
      /position|spawn|x uuid|y uuid|integer/i
    );
  }
);


test(
  "initialization preserves canonical lock hierarchy",
  () => {
    const combat =
      sql.indexOf(
        "FROM public.cing_artillery_combat_states AS c"
      );

    const world =
      sql.indexOf(
        "FROM public.cing_artillery_combat_world_states AS w"
      );

    const sessions =
      sql.indexOf(
        "PERFORM s.id"
      );

    assert.ok(combat >= 0);
    assert.ok(world > combat);
    assert.ok(sessions > world);

    assert.match(
      sql,
      /ORDER BY s\.id\s+FOR UPDATE/
    );
  }
);


test(
  "initialization is exact two-row idempotent authority",
  () => {
    assert.match(
      sql,
      /IF v_existing_count = 2 THEN/
    );

    assert.match(
      sql,
      /IF v_existing_count <> 0 THEN/
    );

    assert.match(
      sql,
      /CING_ARTILLERY_PLAYER_WORLD_PARTIAL_STATE/
    );

    const participantValues =
      (
        sql.match(
          /\n\s*1,\n|\n\s*2,\n/g
        ) || []
      ).length;

    assert.ok(
      participantValues >= 2
    );
  }
);


test(
  "both gameplay sessions must still be active",
  () => {
    assert.match(
      sql,
      /v_session_one\.status <> 'active'/
    );

    assert.match(
      sql,
      /v_session_two\.status <> 'active'/
    );

    assert.match(
      sql,
      /v_session_one\.ended_at IS NOT NULL/
    );

    assert.match(
      sql,
      /v_session_two\.ended_at IS NOT NULL/
    );
  }
);


test(
  "both initial player rows share one PostgreSQL timestamp",
  () => {
    const clockCount =
      (
        sql.match(
          /clock_timestamp\(\)/g
        ) || []
      ).length;

    assert.equal(
      clockCount,
      1
    );

    const timestampUseCount =
      (
        sql.match(
          /v_initialized_at/g
        ) || []
      ).length;

    assert.ok(
      timestampUseCount >= 5
    );
  }
);


test(
  "player world table and initializer are closed to application roles",
  () => {
    for (
      const role of [
        "PUBLIC",
        "anon",
        "authenticated",
        "service_role",
      ]
    ) {
      assert.match(
        sql,
        new RegExp(
          "FROM " +
            role.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )
        )
      );
    }

    assert.doesNotMatch(
      sql,
      /GRANT\s+(?:INSERT|UPDATE|DELETE|EXECUTE)/i
    );

    assert.doesNotMatch(
      sql,
      /SECURITY DEFINER/i
    );
  }
);


test(
  "foundation does not implement terrain gravity HP or projectile world-exit authority",
  () => {
    const executable =
      sql
        .replace(
          /\/\*[\s\S]*?\*\//g,
          ""
        )
        .replace(
          /--.*$/gm,
          ""
        );

    assert.doesNotMatch(
      executable,
      /collision_mask/i
    );

    assert.doesNotMatch(
      executable,
      /\bhp\b|current_hp|remaining_hp/i
    );

    assert.doesNotMatch(
      executable,
      /out_of_bounds/i
    );

    assert.doesNotMatch(
      executable,
      /gravity/i
    );
  }
);


test(
  "migration is one atomic transaction",
  () => {
    assert.equal(
      (
        sql.match(
          /\bBEGIN;/g
        ) || []
      ).length,
      1
    );

    assert.equal(
      (
        sql.match(
          /\bCOMMIT;/g
        ) || []
      ).length,
      1
    );

    assert.ok(
      sql.trim().startsWith(
        "BEGIN;"
      )
    );

    assert.ok(
      sql.trim().endsWith(
        "COMMIT;"
      )
    );
  }
);

console.log(
  "PASS: wrote 5J-COMMERCIAL-1A player world-state foundation"
);
