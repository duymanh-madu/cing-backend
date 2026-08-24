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
    "../../../../db/migrations/20260824_cing_artillery_admission_side_door_authority_v1.sql"
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
  "account creation is one effective-access authorized SECURITY DEFINER RPC",
  () => {
    assert.match(
      executable,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_get_or_create_account_authorized_v1\s*\(\s*p_user_id text\s*\)/iu
    );

    assert.match(
      executable,
      /public\.cing_artillery_has_effective_gameplay_access_v1\s*\(\s*v_user_id\s*\)/iu
    );

    assert.match(
      executable,
      /INSERT INTO public\.cing_artillery_accounts/iu
    );

    assert.match(
      executable,
      /ON CONFLICT\s*\(\s*user_id\s*\)\s*DO NOTHING/iu
    );
  }
);


test(
  "gameplay-session creation serializes on canonical account",
  () => {
    assert.match(
      executable,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_get_or_create_gameplay_session_authorized_v1\s*\(\s*p_account_id uuid\s*\)/iu
    );

    assert.match(
      executable,
      /FROM public\.cing_artillery_accounts AS a WHERE a\.id = p_account_id FOR UPDATE/iu
    );

    assert.match(
      executable,
      /v_account\.status <> 'active'/iu
    );
  }
);


test(
  "gameplay-session admission requires canonical account effective access",
  () => {
    assert.match(
      executable,
      /public\.cing_artillery_account_has_effective_gameplay_access_private_v1\s*\(\s*v_account\.id\s*\)/iu
    );

    assert.match(
      executable,
      /MESSAGE = 'cing_artillery_disabled'/iu
    );
  }
);


test(
  "gameplay-session get-or-create is idempotent under account lock",
  () => {
    assert.match(
      executable,
      /FROM public\.cing_artillery_gameplay_sessions AS s WHERE s\.account_id = v_account\.id AND s\.status = 'active'/iu
    );

    assert.match(
      executable,
      /IF FOUND THEN RETURN v_session/iu
    );

    assert.match(
      executable,
      /INSERT INTO public\.cing_artillery_gameplay_sessions/iu
    );
  }
);


test(
  "account and gameplay-session tables become service-role select-only",
  () => {
    for (
      const table
      of [
        "cing_artillery_accounts",
        "cing_artillery_gameplay_sessions",
      ]
    ) {
      assert.match(
        executable,
        new RegExp(
          `REVOKE ALL ON TABLE public\\.${table} FROM service_role`,
          "iu"
        )
      );

      assert.match(
        executable,
        new RegExp(
          `GRANT SELECT ON TABLE public\\.${table} TO service_role`,
          "iu"
        )
      );

      assert.doesNotMatch(
        executable,
        new RegExp(
          `GRANT (?:INSERT|UPDATE|DELETE|ALL) ON TABLE public\\.${table} TO service_role`,
          "iu"
        )
      );
    }
  }
);


test(
  "both admission RPCs are service-role-only",
  () => {
    for (
      const signature
      of [
        "cing_artillery_get_or_create_account_authorized_v1",
        "cing_artillery_get_or_create_gameplay_session_authorized_v1",
      ]
    ) {
      assert.match(
        executable,
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${signature}`,
          "iu"
        )
      );
    }

    assert.doesNotMatch(
      executable,
      /GRANT EXECUTE[\s\S]*TO authenticated/iu
    );

    assert.doesNotMatch(
      executable,
      /GRANT EXECUTE[\s\S]*TO anon/iu
    );
  }
);


test(
  "admission foundation does not gate durable cleanup",
  () => {
    assert.doesNotMatch(
      executable,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_end_gameplay_session_atomic/iu
    );

    assert.doesNotMatch(
      executable,
      /cing_artillery_claim_shot_executions_atomic/iu
    );

    assert.doesNotMatch(
      executable,
      /cing_artillery_commit_resolution_fenced_atomic/iu
    );

    assert.doesNotMatch(
      executable,
      /cing_artillery_advance_turn_private/iu
    );
  }
);


test(
  "admission foundation does not rewrite gameplay progression or profile domains",
  () => {
    const forbidden = [
      /onboard_cing_artillery_character_atomic\s*\(/iu,
      /cing_artillery_enter_matchmaking_atomic\s*\(/iu,
      /cing_artillery_get_or_create_match_runtime_atomic\s*\(/iu,
      /cing_artillery_get_or_create_combat_state_atomic\s*\(/iu,
      /cing_artillery_get_or_create_combat_vital_state_atomic\s*\(/iu,
      /cing_artillery_get_or_create_combat_world_atomic\s*\(/iu,
      /cing_artillery_get_or_create_turn_state_atomic\s*\(/iu,
      /cing_artillery_activate_first_turn_atomic\s*\(/iu,
      /cing_artillery_accept_shot_command_atomic\s*\(/iu,
      /cing_artillery_loadouts/iu,
      /cing_artillery_characters/iu,
      /cing_artillery_inventory/iu,
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


test(
  "admission authority introduces no gameplay advantage or transport",
  () => {
    const forbidden = [
      /\bgame_plays\b/iu,
      /\bpending_rewards\b/iu,
      /\bwallet\b/iu,
      /\bdamage\b/iu,
      /\bmax_hp\b/iu,
      /\bscore\b/iu,
      /\brank\b/iu,
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
