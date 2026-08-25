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
    "../../../../db/migrations/20260825_cing_artillery_abandoned_turn_initiative_compatibility_v1.sql"
  );

const migration72Path =
  path.resolve(
    __dirname,
    "../../../../db/migrations/20260825_cing_artillery_unplayed_match_abandonment_v1.sql"
  );

const sql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

const migration72 =
  fs.readFileSync(
    migration72Path,
    "utf8"
  );


test(
  "migration is one explicit transaction",
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
  "migration rewrites exactly the canonical initiative constraint",
  () => {
    const drops =
      sql.match(
        /DROP CONSTRAINT\s+cing_artillery_turn_states_initiative_reason_check/giu
      ) || [];

    const adds =
      sql.match(
        /ADD CONSTRAINT\s+cing_artillery_turn_states_initiative_reason_check/giu
      ) || [];

    assert.equal(
      drops.length,
      1
    );

    assert.equal(
      adds.length,
      1
    );
  }
);


test(
  "pending turn still requires null initiative reason",
  () => {
    assert.match(
      sql,
      /status\s*=\s*'pending'[\s\S]*?initiative_reason\s+IS\s+NULL/iu
    );
  }
);


test(
  "active completed and abandoned preserve canonical initiative provenance",
  () => {
    assert.match(
      sql,
      /status\s+IN\s*\(\s*'active'\s*,\s*'completed'\s*,\s*'abandoned'\s*\)[\s\S]*?initiative_reason\s+IN\s*\(\s*'speed'\s*,\s*'speed_tiebreak'\s*\)/iu
    );
  }
);


test(
  "compatibility migration does not rewrite abandonment RPC",
  () => {
    assert.doesNotMatch(
      sql,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.cing_artillery_abandon_unplayed_match_atomic_v1/iu
    );
  }
);


test(
  "compatibility migration owns no gameplay or rollout mutation",
  () => {
    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.app_configs/iu
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_turn_states/iu
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_combat_states/iu
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_matches/iu
    );

    assert.doesNotMatch(
      sql,
      /UPDATE\s+public\.cing_artillery_match_runtimes/iu
    );
  }
);


test(
  "migration72 intentionally preserves initiative reason on abandoned turn",
  () => {
    assert.match(
      migration72,
      /UPDATE public\.cing_artillery_turn_states[\s\S]*?status\s*=\s*'abandoned'/iu
    );

    assert.doesNotMatch(
      migration72,
      /initiative_reason\s*=\s*NULL/iu
    );
  }
);
