"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const ROOT =
  path.resolve(
    __dirname,
    "../../../.."
  );

const MIGRATION =
  path.join(
    ROOT,
    "db/migrations/20260824_cing_artillery_result_stream_read_authority_v1.sql"
  );

const sql =
  fs
    .readFileSync(
      MIGRATION,
      "utf8"
    )
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

function matches(
  pattern,
  message
) {
  assert.match(
    sql,
    pattern,
    message
  );
}

function notMatches(
  pattern,
  message
) {
  assert.doesNotMatch(
    sql,
    pattern,
    message
  );
}

test(
  "authorized result read is one hardened server-only SECURITY DEFINER RPC",
  () => {
    matches(
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_read_result_stream_authorized_v1\s*\(\s*p_match_id uuid,\s*p_match_runtime_id uuid,\s*p_account_id uuid,\s*p_after_sequence text,\s*p_limit integer\s*\)/iu,
      "exact read RPC signature must remain locked"
    );

    matches(
      /LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public/iu,
      "read authority must be STABLE, SECURITY DEFINER and hardened"
    );

    matches(
      /REVOKE ALL ON FUNCTION public\.cing_artillery_read_result_stream_authorized_v1\s*\(\s*uuid,\s*uuid,\s*uuid,\s*text,\s*integer\s*\) FROM PUBLIC/iu,
      "PUBLIC execute must be revoked"
    );

    matches(
      /REVOKE ALL ON FUNCTION public\.cing_artillery_read_result_stream_authorized_v1\s*\(\s*uuid,\s*uuid,\s*uuid,\s*text,\s*integer\s*\) FROM anon/iu,
      "anon execute must be revoked"
    );

    matches(
      /REVOKE ALL ON FUNCTION public\.cing_artillery_read_result_stream_authorized_v1\s*\(\s*uuid,\s*uuid,\s*uuid,\s*text,\s*integer\s*\) FROM authenticated/iu,
      "authenticated execute must be revoked"
    );

    matches(
      /GRANT EXECUTE ON FUNCTION public\.cing_artillery_read_result_stream_authorized_v1\s*\(\s*uuid,\s*uuid,\s*uuid,\s*text,\s*integer\s*\) TO service_role/iu,
      "service_role must be sole application execute authority"
    );
  }
);

test(
  "cursor crosses application boundary only as canonical text",
  () => {
    matches(
      /p_after_sequence text/iu
    );

    matches(
      /p_after_sequence <> btrim\s*\(\s*p_after_sequence\s*\)/iu
    );

    matches(
      /p_after_sequence !~ '\^\(0\|\[1-9\]\[0-9\]\*\)\$'/iu
    );

    matches(
      /v_after_sequence := p_after_sequence::bigint/iu
    );

    matches(
      /result_sequence text/iu
    );

    matches(
      /s\.result_sequence::text/iu
    );

    notMatches(
      /p_after_sequence (?:integer|bigint|numeric)/iu,
      "transport cursor input must never become JSON number authority"
    );
  }
);

test(
  "read is strictly bounded",
  () => {
    matches(
      /p_limit IS NULL OR p_limit < 1 OR p_limit > 100/iu
    );

    const limits =
      sql.match(
        /LIMIT p_limit/giu
      ) || [];

    assert.equal(
      limits.length,
      2,
      "candidate integrity check and final read must use same bounded limit"
    );
  }
);

test(
  "durable runtime owns participant authorization",
  () => {
    matches(
      /FROM public\.cing_artillery_match_runtimes AS r WHERE r\.id = p_match_runtime_id AND r\.match_id = p_match_id/iu
    );

    matches(
      /p_account_id IS DISTINCT FROM v_runtime\.player_one_account_id AND p_account_id IS DISTINCT FROM v_runtime\.player_two_account_id/iu
    );

    notMatches(
      /socket|room membership|socket\.data/iu,
      "executable SQL must not rely on transport state"
    );
  }
);

test(
  "stream and canonical resolution identity must agree fail closed",
  () => {
    matches(
      /CING_ARTILLERY_RESULT_STREAM_IDENTITY_INCONSISTENT_V1/iu
    );

    for (const field of [
      "execution_id",
      "shot_command_id",
      "combat_state_id",
      "turn_state_id",
      "match_runtime_id",
      "match_id",
      "turn_number",
    ]) {
      matches(
        new RegExp(
          `r\\.${field} IS DISTINCT FROM s\\.${field}`,
          "iu"
        ),
        `integrity check must compare ${field}`
      );
    }
  }
);

test(
  "canonical read is match/runtime scoped and strictly sequence ordered",
  () => {
    matches(
      /s\.match_id = p_match_id AND s\.match_runtime_id = p_match_runtime_id AND s\.result_sequence > v_after_sequence/iu
    );

    const orders =
      sql.match(
        /ORDER BY s\.result_sequence ASC/giu
      ) || [];

    assert.equal(
      orders.length,
      2,
      "integrity candidate and final delivery must share exact ordering"
    );
  }
);

test(
  "canonical gameplay payload is joined from shot resolutions",
  () => {
    matches(
      /JOIN public\.cing_artillery_shot_resolutions AS r ON r\.id = s\.resolution_id/iu
    );

    matches(
      /r\.physics_version,\s*r\.outcome/iu
    );

    matches(
      /r\.target_account_id,\s*r\.damage::text/iu
    );

    matches(
      /r\.resolved_at,\s*r\.created_at,\s*s\.created_at/iu
    );
  }
);

test(
  "all arbitrary precision resolution scalars cross transport as text",
  () => {
    for (const field of [
      "impact_physics_fixed_scale",
      "impact_start_x_scaled",
      "impact_start_y_scaled",
      "impact_delta_x_scaled",
      "impact_delta_y_scaled",
      "impact_contact_numerator",
      "impact_contact_denominator",
      "impact_contact_a",
      "impact_contact_b",
      "impact_contact_discriminant",
      "impact_x",
      "impact_y",
      "damage",
    ]) {
      matches(
        new RegExp(
          `r\\.${field}::text`,
          "iu"
        ),
        `${field} must cross application boundary as text`
      );
    }
  }
);

test(
  "read authority introduces no gameplay or stream mutation",
  () => {
    notMatches(
      /\bINSERT\s+INTO\b/iu
    );

    notMatches(
      /\bUPDATE\b[\s\S]*\bSET\b/iu
    );

    notMatches(
      /\bDELETE\s+FROM\b/iu
    );

    notMatches(
      /\bTRUNCATE\b/iu
    );

    notMatches(
      /\bnextval\s*\(/iu
    );
  }
);

test(
  "read authority owns no transport notification or cursor persistence",
  () => {
    notMatches(
      /\bpg_notify\s*\(/iu
    );

    notMatches(
      /\bNOTIFY\b/iu
    );

    notMatches(
      /\bLISTEN\b/iu
    );

    notMatches(
      /\bACK\b/iu
    );
  }
);

test(
  "read authority does not mutate or depend on global gameplay gate",
  () => {
    notMatches(
      /app_configs/iu
    );

    notMatches(
      /cing_artillery_config/iu
    );

    notMatches(
      /cing_artillery_set_gameplay_enabled_atomic/iu
    );
  }
);
