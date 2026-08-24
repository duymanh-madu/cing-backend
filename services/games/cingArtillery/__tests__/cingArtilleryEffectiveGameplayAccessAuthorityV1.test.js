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
    "../../../../db/migrations/20260824_cing_artillery_effective_gameplay_access_authority_v1.sql"
  );

const source =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

const executable =
  source
    .replace(
      /--[^\n]*/gu,
      " "
    )
    .replace(
      /\/\*[\s\S]*?\*\//gu,
      " "
    )
    .replace(
      /\s+/gu,
      " "
    )
    .trim();

test(
  "effective access has one private validated global gameplay reader",
  () => {
    assert.match(
      executable,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_global_gameplay_enabled_private_v1\(\) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public/iu
    );

    assert.match(
      executable,
      /FROM public\.app_configs WHERE id = 1/iu
    );

    assert.match(
      executable,
      /v_config -> 'enabled'/iu
    );

    assert.match(
      executable,
      /MESSAGE = 'cing_artillery_config_invalid'/iu
    );
  }
);

test(
  "canonical user effective access is global enabled or active beta membership",
  () => {
    assert.match(
      executable,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_has_effective_gameplay_access_v1\s*\(\s*p_user_id text\s*\)/iu
    );

    assert.match(
      executable,
      /IF public\.cing_artillery_global_gameplay_enabled_private_v1\(\) THEN RETURN true/iu
    );

    assert.match(
      executable,
      /public\.cing_artillery_has_private_beta_access_v1\s*\(\s*v_user_id\s*\)/iu
    );
  }
);

test(
  "effective user access is service-role-only",
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
        executable,
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.cing_artillery_has_effective_gameplay_access_v1\\s*\\(\\s*text\\s*\\) FROM ${role}`,
          "iu"
        )
      );
    }

    assert.match(
      executable,
      /GRANT EXECUTE ON FUNCTION public\.cing_artillery_has_effective_gameplay_access_v1\s*\(\s*text\s*\) TO service_role/iu
    );
  }
);

test(
  "deep account access resolves canonical user id from artillery account",
  () => {
    assert.match(
      executable,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_account_has_effective_gameplay_access_private_v1\s*\(\s*p_account_id uuid\s*\)/iu
    );

    assert.match(
      executable,
      /SELECT a\.user_id INTO v_user_id FROM public\.cing_artillery_accounts AS a WHERE a\.id = p_account_id/iu
    );

    assert.match(
      executable,
      /public\.cing_artillery_has_effective_gameplay_access_v1\s*\(\s*v_user_id\s*\)/iu
    );
  }
);

test(
  "canonical participant pair requires both accounts to retain effective access",
  () => {
    assert.match(
      executable,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_participants_have_effective_gameplay_access_private_v1/iu
    );

    const calls =
      executable.match(
        /public\.cing_artillery_account_has_effective_gameplay_access_private_v1\s*\(/giu
      ) || [];

    assert.ok(
      calls.length >= 2
    );

    assert.match(
      executable,
      /p_player_one_account_id[\s\S]*AND[\s\S]*p_player_two_account_id/iu
    );
  }
);

test(
  "deep access helpers are private from every application role",
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
        executable,
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.cing_artillery_account_has_effective_gameplay_access_private_v1\\s*\\(\\s*uuid\\s*\\) FROM ${role}`,
          "iu"
        )
      );

      assert.match(
        executable,
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.cing_artillery_participants_have_effective_gameplay_access_private_v1\\s*\\(\\s*uuid,\\s*uuid\\s*\\) FROM ${role}`,
          "iu"
        )
      );
    }
  }
);

test(
  "effective access foundation does not rewrite gameplay RPCs",
  () => {
    const createFunctions =
      executable.match(
        /CREATE OR REPLACE FUNCTION/giu
      ) || [];

    assert.equal(
      createFunctions.length,
      4
    );

    assert.doesNotMatch(
      executable,
      /onboard_cing_artillery_character_atomic\s*\(/iu
    );

    assert.doesNotMatch(
      executable,
      /cing_artillery_get_or_create_match_runtime_atomic\s*\(/iu
    );

    assert.doesNotMatch(
      executable,
      /cing_artillery_accept_shot_command_atomic\s*\(/iu
    );
  }
);

test(
  "effective access foundation introduces no gameplay mutation or tester provisioning",
  () => {
    const forbidden = [
      /UPDATE\s+public\.app_configs/iu,
      /INSERT\s+INTO\s+public\.cing_artillery_private_beta_access/iu,
      /UPDATE\s+public\.cing_artillery_private_beta_access/iu,
      /0984966336/u,
      /0961835636/u,
      /\bgame_plays\b/iu,
      /\bpending_rewards\b/iu,
      /\bwallet\b/iu,
      /\bdamage\b/iu,
      /\bmax_hp\b/iu,
      /\bLISTEN\b/iu,
      /\bNOTIFY\b/iu,
      /\bpg_notify\s*\(/iu,
    ];

    for (
      const pattern
      of forbidden
    ) {
      assert.doesNotMatch(
        executable,
        pattern
      );
    }
  }
);
