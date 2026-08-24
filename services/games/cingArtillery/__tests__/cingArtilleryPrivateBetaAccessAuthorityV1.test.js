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
    "../../../../db/migrations/20260824_cing_artillery_private_beta_access_authority_v1.sql"
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
  "private beta owns one durable user-id membership table",
  () => {
    assert.match(
      executable,
      /CREATE TABLE IF NOT EXISTS public\.cing_artillery_private_beta_access\s*\(\s*user_id uuid PRIMARY KEY/iu
    );

    assert.match(
      executable,
      /enabled boolean NOT NULL DEFAULT true/iu
    );

    assert.match(
      executable,
      /starts_at timestamptz/iu
    );

    assert.match(
      executable,
      /ends_at timestamptz/iu
    );

    assert.match(
      executable,
      /revoked_at timestamptz/iu
    );
  }
);

test(
  "private beta authority stores no phone identity",
  () => {
    assert.doesNotMatch(
      executable,
      /phone|phone_number|zalo_id/iu
    );
  }
);

test(
  "active membership is time-bounded and revocable",
  () => {
    assert.match(
      executable,
      /b\.enabled = true/iu
    );

    assert.match(
      executable,
      /b\.revoked_at IS NULL/iu
    );

    assert.match(
      executable,
      /b\.starts_at IS NULL OR b\.starts_at <= now\(\)/iu
    );

    assert.match(
      executable,
      /b\.ends_at IS NULL OR b\.ends_at > now\(\)/iu
    );
  }
);

test(
  "read authority is hardened server-only",
  () => {
    assert.match(
      executable,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_has_private_beta_access_v1\s*\(\s*p_user_id uuid\s*\) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public/iu
    );

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
          `REVOKE ALL ON FUNCTION public\\.cing_artillery_has_private_beta_access_v1\\s*\\(\\s*uuid\\s*\\) FROM ${role}`,
          "iu"
        )
      );
    }

    assert.match(
      executable,
      /GRANT EXECUTE ON FUNCTION public\.cing_artillery_has_private_beta_access_v1\s*\(\s*uuid\s*\) TO service_role/iu
    );
  }
);

test(
  "mutation authority provisions or revokes exactly one membership",
  () => {
    assert.match(
      executable,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_set_private_beta_access_v1/iu
    );

    assert.match(
      executable,
      /INSERT INTO public\.cing_artillery_private_beta_access/iu
    );

    assert.match(
      executable,
      /ON CONFLICT\s*\(\s*user_id\s*\)\s*DO UPDATE/iu
    );

    assert.doesNotMatch(
      executable,
      /UPDATE public\.app_configs/iu
    );

    assert.doesNotMatch(
      executable,
      /cing_artillery_set_gameplay_enabled_atomic/iu
    );
  }
);

test(
  "private beta table is not directly exposed to service role",
  () => {
    assert.match(
      executable,
      /ALTER TABLE public\.cing_artillery_private_beta_access ENABLE ROW LEVEL SECURITY/iu
    );

    assert.match(
      executable,
      /REVOKE ALL ON TABLE public\.cing_artillery_private_beta_access FROM service_role/iu
    );

    assert.doesNotMatch(
      executable,
      /GRANT (SELECT|INSERT|UPDATE|DELETE|ALL).*cing_artillery_private_beta_access.*TO service_role/iu
    );
  }
);

test(
  "private beta authority does not grant gameplay advantage",
  () => {
    for (
      const token
      of [
        "game_plays",
        "points",
        "score",
        "rank",
        "reward",
        "damage",
        "max_hp",
        "inventory",
        "wallet",
      ]
    ) {
      assert.doesNotMatch(
        executable,
        new RegExp(
          `\\b${token}\\b`,
          "iu"
        )
      );
    }
  }
);

test(
  "private beta does not enable global gameplay or worker",
  () => {
    assert.doesNotMatch(
      executable,
      /app_configs/iu
    );

    assert.doesNotMatch(
      executable,
      /execution_worker/iu
    );

    assert.doesNotMatch(
      executable,
      /gameplay_enabled/iu
    );
  }
);
