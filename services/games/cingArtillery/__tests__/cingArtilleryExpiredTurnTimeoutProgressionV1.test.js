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

const migrationPath =
  path.resolve(
    __dirname,
    "../../../../db/migrations/20260825_cing_artillery_expired_turn_timeout_progression_v1.sql"
  );

const source =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

test(
  "expired-turn authority is bounded SECURITY DEFINER RPC",
  () => {
    assert.match(
      source,
      /CREATE OR REPLACE FUNCTION\s+public\.cing_artillery_advance_expired_turns_atomic\(\s*p_limit integer\s*\)/iu
    );

    assert.match(
      source,
      /RETURNS SETOF\s+public\.cing_artillery_turn_states/iu
    );

    assert.match(
      source,
      /SECURITY DEFINER/iu
    );

    assert.match(
      source,
      /IF p_limit IS NULL\s+OR p_limit <= 0/iu
    );

    assert.match(
      source,
      /LIMIT p_limit/iu
    );
  }
);

test(
  "candidate selection uses PostgreSQL deadline and initialized combat",
  () => {
    assert.match(
      source,
      /t\.status\s*=\s*'active'/iu
    );

    assert.match(
      source,
      /t\.turn_deadline_at\s*<=\s*clock_timestamp\(\)/iu
    );

    assert.match(
      source,
      /c\.status\s*=\s*'initialized'/iu
    );
  }
);

test(
  "timeout authority skips turns that already own accepted shot",
  () => {
    const shotChecks =
      source.match(
        /NOT EXISTS\s*\([\s\S]*?cing_artillery_shot_commands/giu
      ) || [];

    assert.equal(
      shotChecks.length >= 1,
      true
    );

    assert.match(
      source,
      /s\.turn_state_id\s*=\s*v_turn\.id/iu
    );

    assert.match(
      source,
      /s\.turn_number\s*=\s*v_turn\.turn_number/iu
    );
  }
);

test(
  "timeout authority preserves combat then turn lock order",
  () => {
    const combatLock =
      source.indexOf(
        "public.cing_artillery_combat_states AS c"
      );

    const combatSkipLocked =
      source.indexOf(
        "FOR UPDATE SKIP LOCKED",
        combatLock
      );

    const turnLock =
      source.indexOf(
        "public.cing_artillery_turn_states AS t",
        combatSkipLocked
      );

    const turnForUpdate =
      source.indexOf(
        "FOR UPDATE;",
        turnLock
      );

    assert.equal(
      combatLock >= 0,
      true
    );

    assert.equal(
      combatSkipLocked >
        combatLock,
      true
    );

    assert.equal(
      turnLock >
        combatSkipLocked,
      true
    );

    assert.equal(
      turnForUpdate >
        turnLock,
      true
    );
  }
);

test(
  "timeout authority delegates mutation to private canonical advancement primitive",
  () => {
    assert.match(
      source,
      /public\.cing_artillery_advance_turn_private\(\s*v_combat\.id,\s*v_turn\.id,\s*v_turn\.turn_number\s*\)/iu
    );

    const directUpdates =
      source.match(
        /UPDATE\s+public\.cing_artillery_turn_states/giu
      ) || [];

    assert.equal(
      directUpdates.length,
      0
    );
  }
);

test(
  "only service_role receives outer timeout authority",
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
        source,
        new RegExp(
          String.raw`REVOKE ALL[\s\S]*?cing_artillery_advance_expired_turns_atomic\([\s\S]*?integer[\s\S]*?\)[\s\S]*?FROM ${role}`,
          "iu"
        )
      );
    }

    assert.match(
      source,
      /GRANT EXECUTE[\s\S]*?cing_artillery_advance_expired_turns_atomic\([\s\S]*?integer[\s\S]*?\)[\s\S]*?TO service_role/iu
    );

    assert.doesNotMatch(
      source,
      /GRANT EXECUTE[\s\S]*?cing_artillery_advance_expired_turns_atomic[\s\S]*?TO anon/iu
    );

    assert.doesNotMatch(
      source,
      /GRANT EXECUTE[\s\S]*?cing_artillery_advance_expired_turns_atomic[\s\S]*?TO authenticated/iu
    );
  }
);

test(
  "timeout authority does not enable gameplay root or emit realtime",
  () => {
    assert.doesNotMatch(
      source,
      /UPDATE\s+public\.app_configs/iu
    );

    assert.doesNotMatch(
      source,
      /cing_artillery_set_gameplay_enabled/iu
    );

    assert.doesNotMatch(
      source,
      /socket|realtime|emit/iu
    );
  }
);
