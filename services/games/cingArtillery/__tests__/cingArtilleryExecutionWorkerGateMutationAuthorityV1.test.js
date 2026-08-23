"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const MIGRATION =
  path.resolve(
    __dirname,
    "../../../..",
    "db/migrations/20260824_cing_artillery_execution_worker_gate_mutation_authority_v1.sql"
  );

function rawSource() {
  return fs.readFileSync(
    MIGRATION,
    "utf8"
  );
}

function source() {
  return rawSource()
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
}

test(
  "worker gate writer is one hardened SECURITY DEFINER RPC",
  () => {
    const sql =
      source();

    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_set_execution_worker_enabled_atomic\s*\(\s*p_enabled boolean\s*\)/iu
    );

    assert.match(
      sql,
      /RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public/iu
    );
  }
);

test(
  "worker gate writer locks canonical app config before mutation",
  () => {
    const sql =
      source();

    assert.match(
      sql,
      /FROM public\.app_configs WHERE id = 1 FOR UPDATE/iu
    );
  }
);

test(
  "worker gate writer requires exact six-key root V1 contract",
  () => {
    const sql =
      source();

    assert.match(
      sql,
      /v_root_key_count <> 6/iu
    );

    for (
      const key
      of [
        "version",
        "enabled",
        "rules",
        "starter",
        "execution_policy",
        "execution_worker",
      ]
    ) {
      assert.ok(
        sql.includes(
          `v_config ? '${key}'`
        ),
        `missing root key check: ${key}`
      );
    }

    assert.match(
      sql,
      /\(v_config ->> 'version'\)::integer <> 1/iu
    );
  }
);

test(
  "worker gate writer requires exact execution_worker V1 contract",
  () => {
    const sql =
      source();

    assert.match(
      sql,
      /v_worker_key_count <> 2/iu
    );

    assert.ok(
      sql.includes(
        "v_worker ? 'version'"
      )
    );

    assert.ok(
      sql.includes(
        "v_worker ? 'enabled'"
      )
    );

    assert.match(
      sql,
      /\(v_worker ->> 'version'\)::integer <> 1/iu
    );
  }
);

test(
  "worker gate writer changes only nested enabled field",
  () => {
    const sql =
      source();

    assert.match(
      sql,
      /jsonb_set\s*\(\s*v_config\s*,\s*'\{execution_worker,enabled\}'\s*,\s*to_jsonb\(p_enabled\)\s*,\s*false\s*\)/iu
    );

    assert.match(
      sql,
      /\(\s*v_next_config\s*-\s*'execution_worker'\s*\)\s*<>\s*\(\s*v_config\s*-\s*'execution_worker'\s*\)/iu
    );

    assert.match(
      sql,
      /\(\s*v_next_worker\s*-\s*'enabled'\s*\)\s*<>\s*\(\s*v_worker\s*-\s*'enabled'\s*\)/iu
    );
  }
);

test(
  "worker gate writer never reconstructs gameplay config",
  () => {
    const sql =
      source();

    assert.doesNotMatch(
      sql,
      /jsonb_build_object/iu
    );

    assert.doesNotMatch(
      sql,
      /jsonb_set\s*\([^)]*'\{enabled\}'/iu
    );

    assert.doesNotMatch(
      sql,
      /jsonb_set\s*\([^)]*'\{rules\}'/iu
    );

    assert.doesNotMatch(
      sql,
      /jsonb_set\s*\([^)]*'\{starter\}'/iu
    );

    assert.doesNotMatch(
      sql,
      /jsonb_set\s*\([^)]*'\{execution_policy\}'/iu
    );
  }
);

test(
  "worker gate writer is independent of global gameplay enabled state",
  () => {
    const sql =
      source();

    assert.doesNotMatch(
      sql,
      /v_config\s*->>\s*'enabled'\s*\)::boolean\s*=\s*true/iu
    );

    assert.doesNotMatch(
      sql,
      /CING_ARTILLERY_DISABLED/iu
    );
  }
);

test(
  "worker gate writer is idempotent",
  () => {
    const sql =
      source();

    assert.match(
      sql,
      /\(v_worker ->> 'enabled'\)::boolean = p_enabled THEN RETURN v_config/iu
    );
  }
);

test(
  "worker gate writer has exactly one durable UPDATE target",
  () => {
    const sql =
      source();

    const updateTargets =
      [
        ...sql.matchAll(
          /\bUPDATE\s+([a-zA-Z0-9_.]+)/giu
        ),
      ].map(
        (match) =>
          match[1].toLowerCase()
      );

    assert.deepEqual(
      updateTargets,
      [
        "public.app_configs",
      ]
    );

    assert.match(
      sql,
      /UPDATE public\.app_configs SET cing_artillery_config = v_next_config WHERE id = 1 RETURNING cing_artillery_config INTO v_updated_config/iu
    );
  }
);

test(
  "worker gate writer is service-role-only",
  () => {
    const sql =
      source();

    const signature =
      String.raw`public\.cing_artillery_set_execution_worker_enabled_atomic\s*\(\s*boolean\s*\)`;

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
        sql,
        new RegExp(
          String.raw`REVOKE ALL ON FUNCTION ${signature} FROM ${role}`,
          "iu"
        )
      );
    }

    assert.match(
      sql,
      new RegExp(
        String.raw`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`,
        "iu"
      )
    );
  }
);

test(
  "worker gate writer exposes stable fail-closed errors",
  () => {
    const sql =
      source();

    for (
      const token
      of [
        "CING_ARTILLERY_EXECUTION_WORKER_ENABLED_STATE_REQUIRED",
        "CING_ARTILLERY_CONFIG_NOT_FOUND",
        "CING_ARTILLERY_CONFIG_INVALID",
        "CING_ARTILLERY_EXECUTION_WORKER_CONFIG_INVALID",
        "CING_ARTILLERY_EXECUTION_WORKER_VERSION_UNSUPPORTED",
        "CING_ARTILLERY_EXECUTION_WORKER_GATE_PRESERVATION_FAILED",
        "CING_ARTILLERY_EXECUTION_WORKER_GATE_PERSISTENCE_INCONSISTENT",
      ]
    ) {
      assert.ok(
        sql.includes(token),
        `missing failure contract: ${token}`
      );
    }
  }
);
