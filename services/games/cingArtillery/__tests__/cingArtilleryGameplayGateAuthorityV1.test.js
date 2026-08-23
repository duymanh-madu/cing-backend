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
    "db/migrations/20260823_cing_artillery_gameplay_gate_authority_v1.sql"
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
  "gameplay gate authority is one hardened SECURITY DEFINER RPC",
  () => {
    const sql =
      source();

    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_set_gameplay_enabled_atomic\s*\(\s*p_enabled boolean\s*\)/iu
    );

    assert.match(
      sql,
      /RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public/iu
    );
  }
);

test(
  "gameplay gate authority locks canonical app config before mutation",
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
  "gameplay gate authority requires exact six-key V1 root contract",
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
        `missing exact root key check: ${key}`
      );
    }

    assert.match(
      sql,
      /\(v_config ->> 'version'\)::integer <> 1/iu
    );
  }
);

test(
  "gameplay gate mutation changes only enabled through jsonb_set",
  () => {
    const sql =
      source();

    assert.match(
      sql,
      /jsonb_set\s*\(\s*v_config\s*,\s*'\{enabled\}'\s*,\s*to_jsonb\(p_enabled\)\s*,\s*false\s*\)/iu
    );

    assert.match(
      sql,
      /\(\s*v_next_config\s*-\s*'enabled'\s*\)\s*<>\s*\(\s*v_config\s*-\s*'enabled'\s*\)/iu
    );

    assert.match(
      sql,
      /\(\s*v_updated_config\s*-\s*'enabled'\s*\)\s*<>\s*\(\s*v_config\s*-\s*'enabled'\s*\)/iu
    );
  }
);

test(
  "gameplay gate authority does not reconstruct nested gameplay configuration",
  () => {
    const sql =
      source();

    assert.doesNotMatch(
      sql,
      /jsonb_build_object/iu
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

    assert.doesNotMatch(
      sql,
      /jsonb_set\s*\([^)]*'\{execution_worker\}'/iu
    );
  }
);

test(
  "gameplay gate authority is idempotent",
  () => {
    const sql =
      source();

    assert.match(
      sql,
      /\(v_config ->> 'enabled'\)::boolean = p_enabled THEN RETURN v_config/iu
    );
  }
);

test(
  "gameplay gate authority has exactly one durable UPDATE target",
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
  "gameplay gate authority is service-role-only",
  () => {
    const sql =
      source();

    const signature =
      String.raw`public\.cing_artillery_set_gameplay_enabled_atomic\s*\(\s*boolean\s*\)`;

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
  "gameplay gate authority rejects null state and malformed config",
  () => {
    const sql =
      source();

    for (
      const token
      of [
        "CING_ARTILLERY_GAMEPLAY_ENABLED_STATE_REQUIRED",
        "CING_ARTILLERY_CONFIG_NOT_FOUND",
        "CING_ARTILLERY_CONFIG_INVALID",
        "CING_ARTILLERY_GAMEPLAY_GATE_PRESERVATION_FAILED",
        "CING_ARTILLERY_GAMEPLAY_GATE_PERSISTENCE_INCONSISTENT",
      ]
    ) {
      assert.ok(
        sql.includes(token),
        `missing failure contract: ${token}`
      );
    }
  }
);
