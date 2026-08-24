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
    "../../../../db/migrations/20260824_cing_artillery_shot_acceptance_effective_access_v1.sql"
  );

const source =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

const sql =
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


function fn(name) {
  const token =
    `CREATE OR REPLACE FUNCTION public.${name}`;

  const start =
    sql.indexOf(token);

  assert.ok(
    start >= 0,
    `missing ${name}`
  );

  const next =
    sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.",
      start + token.length
    );

  return sql.slice(
    start,
    next < 0
      ? sql.length
      : next
  );
}


test(
  "migration rewrites exactly two shot admission boundaries",
  () => {
    const creates =
      sql.match(
        /CREATE OR REPLACE FUNCTION/giu
      ) || [];

    assert.equal(
      creates.length,
      2
    );

    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_accept_shot_command_atomic_pre_angle_grid\s*\(/iu
    );

    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_accept_shot_command_with_execution_atomic\s*\(/iu
    );
  }
);


test(
  "durable core preserves canonical combat then turn lock order",
  () => {
    const body =
      fn(
        "cing_artillery_accept_shot_command_atomic_pre_angle_grid"
      );

    const combat =
      body.indexOf(
        "FROM public.cing_artillery_combat_states AS c"
      );

    const turn =
      body.indexOf(
        "FROM public.cing_artillery_turn_states AS t",
        combat
      );

    assert.ok(
      combat >= 0 &&
      turn > combat
    );
  }
);


test(
  "accepted command retry remains before access and durable insert",
  () => {
    const body =
      fn(
        "cing_artillery_accept_shot_command_atomic_pre_angle_grid"
      );

    const lookup =
      body.indexOf(
        "WHERE s.command_id = p_command_id"
      );

    const recovered =
      body.indexOf(
        "RETURN v_command;",
        lookup
      );

    const access =
      body.indexOf(
        "cing_artillery_participants_have_effective_gameplay_access_private_v1",
        recovered
      );

    const insert =
      body.indexOf(
        "INSERT INTO public.cing_artillery_shot_commands",
        access
      );

    assert.ok(
      lookup >= 0 &&
      recovered > lookup &&
      access > recovered &&
      insert > access
    );
  }
);


test(
  "new shot access uses canonical combat participants",
  () => {
    const body =
      fn(
        "cing_artillery_accept_shot_command_atomic_pre_angle_grid"
      );

    assert.match(
      body,
      /cing_artillery_participants_have_effective_gameplay_access_private_v1\s*\(\s*v_combat\.player_one_account_id,\s*v_combat\.player_two_account_id\s*\)/iu
    );
  }
);


test(
  "legacy root-only gate is gone from durable core",
  () => {
    const body =
      fn(
        "cing_artillery_accept_shot_command_atomic_pre_angle_grid"
      );

    assert.doesNotMatch(
      body,
      /FROM public\.app_configs/iu
    );

    assert.doesNotMatch(
      body,
      /v_config\s*->>\s*'enabled'/iu
    );
  }
);


test(
  "existing execution recovery precedes current access",
  () => {
    const body =
      fn(
        "cing_artillery_accept_shot_command_with_execution_atomic"
      );

    const read =
      body.indexOf(
        "FROM public.cing_artillery_shot_executions AS e"
      );

    const recovered =
      body.indexOf(
        "RETURN v_command;",
        read
      );

    const access =
      body.indexOf(
        "cing_artillery_participants_have_effective_gameplay_access_private_v1",
        recovered
      );

    const insert =
      body.indexOf(
        "INSERT INTO public.cing_artillery_shot_executions",
        access
      );

    assert.ok(
      read >= 0 &&
      recovered > read &&
      access > recovered &&
      insert > access
    );
  }
);


test(
  "execution enqueue remains shot-command idempotent",
  () => {
    const body =
      fn(
        "cing_artillery_accept_shot_command_with_execution_atomic"
      );

    const inserts =
      body.match(
        /INSERT INTO public\.cing_artillery_shot_executions/giu
      ) || [];

    assert.equal(
      inserts.length,
      1
    );

    assert.match(
      body,
      /ON CONFLICT\s*\(\s*shot_command_id\s*\)\s*DO NOTHING/iu
    );
  }
);


test(
  "accept-only public RPC is not service-role executable",
  () => {
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.cing_artillery_accept_shot_command_atomic\s*\([^)]*\) FROM service_role/iu
    );

    assert.doesNotMatch(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.cing_artillery_accept_shot_command_atomic\s*\([^)]*\) TO service_role/iu
    );
  }
);


test(
  "accept plus execution wrapper remains service-role executable",
  () => {
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.cing_artillery_accept_shot_command_with_execution_atomic\s*\([^)]*\) TO service_role/iu
    );
  }
);


test(
  "post-accept continuation authorities are untouched",
  () => {
    const forbidden = [
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_claim_shot_executions_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_resolve_shot_execution_failure_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_release_expired_shot_executions_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_commit_resolution_fenced_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_advance_turn_private/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_complete_combat_private/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_enter_matchmaking_atomic/iu,
      /UPDATE public\.app_configs/iu,
      /INSERT INTO public\.cing_artillery_private_beta_access/iu,
      /\bgame_plays\b/iu,
      /\bpending_rewards\b/iu,
      /\bwallet\b/iu,
      /\bLISTEN\b/iu,
      /\bNOTIFY\b/iu,
    ];

    for (
      const pattern
      of forbidden
    ) {
      assert.doesNotMatch(
        sql,
        pattern
      );
    }
  }
);
