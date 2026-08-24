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
    "../../../../db/migrations/20260824_cing_artillery_core_progression_effective_access_v1.sql"
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


const TARGET_FUNCTIONS = [
  "onboard_cing_artillery_character_atomic",
  "cing_artillery_get_or_create_match_runtime_atomic",
  "cing_artillery_get_or_create_combat_state_atomic",
  "cing_artillery_get_or_create_combat_vital_state_atomic",
  "cing_artillery_get_or_create_combat_world_atomic",
  "cing_artillery_get_or_create_turn_state_atomic",
  "cing_artillery_activate_first_turn_atomic",
];


test(
  "migration rewrites exactly seven core progression functions",
  () => {
    const creates =
      executable.match(
        /CREATE OR REPLACE FUNCTION/giu
      ) || [];

    assert.equal(
      creates.length,
      7
    );

    for (
      const name
      of TARGET_FUNCTIONS
    ) {
      assert.match(
        executable,
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${name}\\s*\\(`,
          "iu"
        )
      );
    }
  }
);


test(
  "onboarding uses canonical user effective access",
  () => {
    assert.match(
      executable,
      /public\.cing_artillery_has_effective_gameplay_access_v1\s*\(\s*v_user_id\s*\)/iu
    );
  }
);


test(
  "six pair progression boundaries require both canonical participants",
  () => {
    const calls =
      executable.match(
        /public\.cing_artillery_participants_have_effective_gameplay_access_private_v1\s*\(/giu
      ) || [];

    assert.equal(
      calls.length,
      6
    );
  }
);


test(
  "legacy enabled-only denial is removed",
  () => {
    assert.doesNotMatch(
      executable,
      /IF NOT\s*\(\s*v_config\s*->>\s*'enabled'\s*\)\s*::boolean/iu
    );
  }
);


test(
  "malformed config validation remains fail closed",
  () => {
    assert.match(
      executable,
      /cing_artillery_config_invalid/iu
    );
  }
);


test(
  "combat vital access check occurs after canonical combat lock",
  () => {
    const fn =
      executable.indexOf(
        "CREATE OR REPLACE FUNCTION public.cing_artillery_get_or_create_combat_vital_state_atomic"
      );

    const lock =
      executable.indexOf(
        "FROM public.cing_artillery_combat_states AS c WHERE c.id = p_combat_state_id FOR UPDATE",
        fn
      );

    const access =
      executable.indexOf(
        "public.cing_artillery_participants_have_effective_gameplay_access_private_v1",
        lock
      );

    assert.ok(
      fn >= 0 &&
      lock > fn &&
      access > lock
    );
  }
);


test(
  "core progression migration does not rewrite matchmaking or shot path",
  () => {
    assert.doesNotMatch(
      executable,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_enter_matchmaking_atomic/iu
    );

    assert.doesNotMatch(
      executable,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_accept_shot_command_atomic/iu
    );

    assert.doesNotMatch(
      executable,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_accept_shot_command_with_execution_atomic/iu
    );
  }
);


test(
  "durable cleanup and execution continuation remain untouched",
  () => {
    const forbidden = [
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_end_gameplay_session_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_claim_shot_executions_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_complete_shot_execution_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_commit_resolution_fenced_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_advance_turn_private/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_complete_combat_private/iu,
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
  "migration does not mutate access policy or provision testers",
  () => {
    const forbidden = [
      /UPDATE public\.app_configs/iu,
      /INSERT INTO public\.cing_artillery_private_beta_access/iu,
      /UPDATE public\.cing_artillery_private_beta_access/iu,
      /DELETE FROM public\.cing_artillery_private_beta_access/iu,
      /\bgame_plays\b/iu,
      /\bpending_rewards\b/iu,
      /\bwallet\b/iu,
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
