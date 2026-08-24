"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const ROOT =
  path.resolve(
    __dirname,
    "../../../.."
  );

const LOCKED_SOURCE =
  path.join(
    ROOT,
    "db/migrations/20260824_cing_artillery_core_progression_effective_access_v1.sql"
  );

const FIX =
  path.join(
    ROOT,
    "db/migrations/20260825_cing_artillery_onboarding_output_parameter_ambiguity_fix_v1.sql"
  );

function read(
  file
) {
  return fs.readFileSync(
    file,
    "utf8"
  );
}

function extractOnboardingFunction(
  source
) {
  const matches =
    source.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\s*\.\s*onboard_cing_artillery_character_atomic\s*\([\s\S]*?\$\$\s*;/giu
    ) || [];

  assert.equal(
    matches.length,
    1,
    "expected exactly one onboarding function"
  );

  return matches[0];
}

test(
  "migration69 rewrites exactly the onboarding authority",
  () => {
    const source =
      read(FIX);

    const rewrites =
      source.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION/giu
      ) || [];

    assert.equal(
      rewrites.length,
      1
    );

    assert.match(
      source,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\s*\.\s*onboard_cing_artillery_character_atomic/iu
    );

    assert.equal(
      (
        source.match(
          /\bBEGIN\s*;/giu
        ) || []
      ).length,
      1
    );

    assert.equal(
      (
        source.match(
          /\bCOMMIT\s*;/giu
        ) || []
      ).length,
      1
    );
  }
);

test(
  "migration69 adds exact PLpgSQL column-precedence directive before DECLARE",
  () => {
    const source =
      extractOnboardingFunction(
        read(FIX)
      );

    assert.match(
      source,
      /AS\s+\$\$\s*#variable_conflict\s+use_column\s+DECLARE/iu
    );

    assert.equal(
      (
        source.match(
          /#variable_conflict\s+use_column/giu
        ) || []
      ).length,
      1
    );
  }
);

test(
  "migration69 preserves locked onboarding function byte-semantics except compiler directive",
  () => {
    const locked =
      extractOnboardingFunction(
        read(LOCKED_SOURCE)
      );

    const fixed =
      extractOnboardingFunction(
        read(FIX)
      ).replace(
        /#variable_conflict\s+use_column\s*/iu,
        ""
      );

    assert.equal(
      fixed,
      locked
    );
  }
);

test(
  "all three known account_id conflict targets remain structurally unchanged",
  () => {
    const source =
      extractOnboardingFunction(
        read(FIX)
      );

    assert.equal(
      (
        source.match(
          /ON\s+CONFLICT\s*\(\s*account_id\s*\)/giu
        ) || []
      ).length,
      1
    );

    assert.equal(
      (
        source.match(
          /ON\s+CONFLICT\s*\(\s*account_id\s*,\s*item_key\s*\)/giu
        ) || []
      ).length,
      1
    );

    assert.equal(
      (
        source.match(
          /ON\s+CONFLICT\s*\(\s*account_id\s*,\s*item_type\s*\)/giu
        ) || []
      ).length,
      1
    );
  }
);

test(
  "all existing account_id WHERE references remain under explicit column precedence",
  () => {
    const source =
      extractOnboardingFunction(
        read(FIX)
      );

    assert.equal(
      (
        source.match(
          /WHERE\s+account_id\s*=/giu
        ) || []
      ).length,
      4
    );

    assert.match(
      source,
      /#variable_conflict\s+use_column/iu
    );
  }
);

test(
  "migration69 preserves effective access and onboarding idempotency authority",
  () => {
    const source =
      extractOnboardingFunction(
        read(FIX)
      );

    assert.match(
      source,
      /cing_artillery_has_effective_gameplay_access_v1/iu
    );

    assert.match(
      source,
      /ON\s+CONFLICT\s*\(\s*user_id\s*\)\s*DO\s+NOTHING/iu
    );

    assert.match(
      source,
      /FOR\s+UPDATE/iu
    );

    assert.match(
      source,
      /character_created/iu
    );
  }
);

test(
  "migration69 restores service-role-only application execution ACL",
  () => {
    const source =
      read(FIX);

    for (
      const role
      of [
        "PUBLIC",
        "anon",
        "authenticated",
      ]
    ) {
      assert.match(
        source,
        new RegExp(
          `REVOKE[\\s\\S]*?onboard_cing_artillery_character_atomic[\\s\\S]*?FROM\\s+${role}`,
          "iu"
        )
      );
    }

    assert.match(
      source,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*?onboard_cing_artillery_character_atomic[\s\S]*?TO\s+service_role/iu
    );
  }
);

test(
  "migration69 does not mutate rollout, beta, worker, economy or rewards",
  () => {
    const source =
      read(FIX);

    assert.doesNotMatch(
      source,
      /cing_artillery_set_gameplay_enabled_atomic/iu
    );

    assert.doesNotMatch(
      source,
      /cing_artillery_set_execution_worker_enabled_atomic/iu
    );

    assert.doesNotMatch(
      source,
      /cing_artillery_set_private_beta_access_v1/iu
    );

    assert.doesNotMatch(
      source,
      /\bpending_rewards\b/iu
    );

    assert.doesNotMatch(
      source,
      /\bgame_plays\b/iu
    );
  }
);
