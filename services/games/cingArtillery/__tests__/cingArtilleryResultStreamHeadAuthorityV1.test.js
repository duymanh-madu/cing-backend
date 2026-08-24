"use strict";

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

const test =
  require(
    "node:test"
  );

const ROOT =
  path.resolve(
    __dirname,
    "../../../.."
  );

const MIGRATION =
  path.join(
    ROOT,
    "db/migrations/20260824_cing_artillery_result_stream_head_authority_v1.sql"
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
  "result stream head is one hardened server-only SECURITY DEFINER RPC",
  () => {
    matches(
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_read_result_stream_head_authorized_v1\s*\(\s*p_match_id uuid,\s*p_match_runtime_id uuid,\s*p_account_id uuid\s*\) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public/iu
    );

    for (
      const role
      of [
        "PUBLIC",
        "anon",
        "authenticated",
      ]
    ) {
      matches(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.cing_artillery_read_result_stream_head_authorized_v1\\s*\\(\\s*uuid,\\s*uuid,\\s*uuid\\s*\\) FROM ${role}`,
          "iu"
        )
      );
    }

    matches(
      /GRANT EXECUTE ON FUNCTION public\.cing_artillery_read_result_stream_head_authorized_v1\s*\(\s*uuid,\s*uuid,\s*uuid\s*\) TO service_role/iu
    );
  }
);

test(
  "durable runtime owns exact participant authorization",
  () => {
    matches(
      /FROM public\.cing_artillery_match_runtimes AS r WHERE r\.id = p_match_runtime_id AND r\.match_id = p_match_id/iu
    );

    matches(
      /p_account_id IS DISTINCT FROM v_runtime\.player_one_account_id AND p_account_id IS DISTINCT FROM v_runtime\.player_two_account_id/iu
    );

    matches(
      /CING_ARTILLERY_RESULT_HEAD_RUNTIME_NOT_FOUND_V1/iu
    );

    matches(
      /CING_ARTILLERY_RESULT_HEAD_ACCESS_DENIED_V1/iu
    );
  }
);

test(
  "head is exact match-runtime scoped and index-friendly descending sequence read",
  () => {
    matches(
      /FROM public\.cing_artillery_result_stream AS s WHERE s\.match_runtime_id = p_match_runtime_id AND s\.match_id = p_match_id ORDER BY s\.result_sequence DESC LIMIT 1/iu
    );

    notMatches(
      /\bMAX\s*\(\s*s?\.?result_sequence\s*\)/iu,
      "head read must use existing ordered btree access rather than aggregate scan"
    );
  }
);

test(
  "head crosses application boundary only as text and empty stream becomes zero",
  () => {
    matches(
      /RETURNS text/iu
    );

    matches(
      /COALESCE\s*\(\s*v_result_sequence,\s*0::bigint\s*\)::text/iu
    );

    notMatches(
      /RETURNS bigint/iu
    );

    notMatches(
      /RETURNS integer/iu
    );
  }
);

test(
  "head does not duplicate canonical result payload authority",
  () => {
    notMatches(
      /cing_artillery_shot_resolutions/iu,
      "head must not read canonical shot-resolution payload"
    );

    for (
      const field
      of [
        "physics_version",
        "outcome",
        "damage",
        "impact_x",
        "impact_y",
        "target_account_id",
      ]
    ) {
      notMatches(
        new RegExp(
          `\\b${field}\\b`,
          "iu"
        ),
        `head must not expose payload field ${field}`
      );
    }
  }
);

test(
  "head authority introduces no durable mutation",
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
  "head owns no transport notification cursor persistence or gameplay gate",
  () => {
    for (
      const pattern
      of [
        /\bpg_notify\s*\(/iu,
        /\bNOTIFY\b/iu,
        /\bLISTEN\b/iu,
        /\bACK\b/iu,
        /app_configs/iu,
        /cing_artillery_set_gameplay_enabled_atomic/iu,
      ]
    ) {
      notMatches(
        pattern
      );
    }
  }
);
