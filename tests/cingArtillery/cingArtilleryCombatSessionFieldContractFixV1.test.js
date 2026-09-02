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
    "../../supabase/migrations/"
      + "20260902103000_cing_artillery_combat_session_field_contract_fix_v1.sql"
  );

const source =
  fs.readFileSync(
    MIGRATION,
    "utf8"
  );

const FUNCTIONS = [
  "cing_artillery_get_or_create_player_world_states_private",
  "cing_artillery_bootstrap_mutable_authority_atomic",
  "cing_artillery_commit_resolution_fenced_atomic",
];

test(
  "corrective migration replaces all three affected authorities",
  () => {
    for (const name of FUNCTIONS) {
      const escaped =
        name.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

      const matches =
        source.match(
          new RegExp(
            "CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\."
              + escaped
              + "\\s*\\(",
            "gi"
          )
        ) || [];

      assert.equal(
        matches.length,
        1,
        `${name} must be replaced exactly once`
      );
    }
  }
);

test(
  "corrective authorities never reference nonexistent gameplay session fields",
  () => {
    assert.doesNotMatch(
      source,
      /v_combat\.player_one_gameplay_session_id/u
    );

    assert.doesNotMatch(
      source,
      /v_combat\.player_two_gameplay_session_id/u
    );
  }
);

test(
  "corrective authorities use canonical combat-state session fields",
  () => {
    assert.match(
      source,
      /v_combat\.player_one_session_id/u
    );

    assert.match(
      source,
      /v_combat\.player_two_session_id/u
    );
  }
);

test(
  "migration remains transactional",
  () => {
    assert.match(
      source,
      /\bBEGIN\s*;/iu
    );

    assert.match(
      source,
      /\bCOMMIT\s*;/iu
    );
  }
);
