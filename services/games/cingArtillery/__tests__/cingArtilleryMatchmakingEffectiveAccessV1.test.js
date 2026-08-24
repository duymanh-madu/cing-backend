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
    "../../../../db/migrations/20260824_cing_artillery_matchmaking_effective_access_v1.sql"
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
  "migration rewrites exactly one matchmaking authority",
  () => {
    const creates =
      executable.match(
        /CREATE OR REPLACE FUNCTION/giu
      ) || [];

    assert.equal(
      creates.length,
      1
    );

    assert.match(
      executable,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_enter_matchmaking_atomic\s*\(\s*p_account_id uuid,\s*p_gameplay_session_id uuid\s*\)/iu
    );
  }
);


test(
  "matched-ticket recovery remains before caller access denial",
  () => {
    const matched =
      executable.indexOf(
        "IF v_ticket.status = 'matched' THEN"
      );

    const matchedReturn =
      executable.indexOf(
        "RETURN;",
        matched
      );

    const firstCallerAccess =
      executable.indexOf(
        "public.cing_artillery_account_has_effective_gameplay_access_private_v1( p_account_id )"
      );

    assert.ok(
      matched >= 0 &&
      matchedReturn > matched &&
      firstCallerAccess > matchedReturn
    );
  }
);


test(
  "waiting and new-ticket paths both require caller effective access",
  () => {
    const calls =
      executable.match(
        /public\.cing_artillery_account_has_effective_gameplay_access_private_v1\s*\(\s*p_account_id\s*\)/giu
      ) || [];

    assert.equal(
      calls.length,
      2
    );

    assert.match(
      executable,
      /MESSAGE = 'cing_artillery_disabled'/iu
    );
  }
);


test(
  "opponent selection excludes revoked or stale accounts",
  () => {
    assert.match(
      executable,
      /AND s\.status = 'active' AND public\.cing_artillery_account_has_effective_gameplay_access_private_v1\s*\(\s*t\.account_id\s*\) ORDER BY/iu
    );
  }
);


test(
  "opponent access is rechecked after durable session lock",
  () => {
    const ticketLock =
      executable.indexOf(
        "FOR UPDATE OF t SKIP LOCKED"
      );

    const sessionLock =
      executable.indexOf(
        "WHERE s.id = v_opponent.gameplay_session_id AND s.account_id = v_opponent.account_id FOR UPDATE",
        ticketLock
      );

    const recheck =
      executable.indexOf(
        "public.cing_artillery_account_has_effective_gameplay_access_private_v1( v_opponent.account_id )",
        sessionLock
      );

    const matchInsert =
      executable.indexOf(
        "INSERT INTO public.cing_artillery_matches",
        recheck
      );

    assert.ok(
      ticketLock >= 0 &&
      sessionLock > ticketLock &&
      recheck > sessionLock &&
      matchInsert > recheck
    );
  }
);


test(
  "existing SKIP LOCKED concurrency semantics remain exact",
  () => {
    assert.match(
      executable,
      /ORDER BY t\.queued_at ASC,\s*t\.id ASC LIMIT 1 FOR UPDATE OF t SKIP LOCKED/iu
    );
  }
);


test(
  "match creation and exactly-two ticket transition remain atomic",
  () => {
    assert.match(
      executable,
      /INSERT INTO public\.cing_artillery_matches/iu
    );

    assert.match(
      executable,
      /UPDATE public\.cing_artillery_matchmaking_tickets AS t SET status = 'matched'/iu
    );

    assert.match(
      executable,
      /GET DIAGNOSTICS v_updated_ticket_count = ROW_COUNT/iu
    );

    assert.match(
      executable,
      /IF v_updated_ticket_count <> 2 THEN/iu
    );
  }
);


test(
  "migration does not cancel or delete stale waiting tickets",
  () => {
    assert.doesNotMatch(
      executable,
      /SET status = 'cancelled'/iu
    );

    assert.doesNotMatch(
      executable,
      /DELETE FROM public\.cing_artillery_matchmaking_tickets/iu
    );
  }
);


test(
  "matchmaking authority is service-role-only",
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
          `REVOKE ALL ON FUNCTION public\\.cing_artillery_enter_matchmaking_atomic\\s*\\(\\s*uuid,\\s*uuid\\s*\\) FROM ${role}`,
          "iu"
        )
      );
    }

    assert.match(
      executable,
      /GRANT EXECUTE ON FUNCTION public\.cing_artillery_enter_matchmaking_atomic\s*\(\s*uuid,\s*uuid\s*\) TO service_role/iu
    );
  }
);


test(
  "migration does not rewrite gameplay continuation or shot authority",
  () => {
    const forbidden = [
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_accept_shot_command_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_accept_shot_command_with_execution_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_get_or_create_match_runtime_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_get_or_create_combat_state_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_get_or_create_combat_vital_state_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_get_or_create_combat_world_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_get_or_create_turn_state_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_activate_first_turn_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_end_gameplay_session_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_claim_shot_executions_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_commit_resolution_fenced_atomic/iu,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_advance_turn_private/iu,
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
        executable,
        pattern
      );
    }
  }
);
