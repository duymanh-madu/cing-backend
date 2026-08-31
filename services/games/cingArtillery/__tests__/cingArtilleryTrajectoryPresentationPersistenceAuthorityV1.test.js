"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");


const migration =
  fs.readFileSync(
    path.join(
      __dirname,
      "../../../..",
      "db/migrations/20260901_cing_artillery_trajectory_presentation_persistence_v1.sql"
    ),
    "utf8"
  );


test(
  "trajectory sidecar is one-to-one with canonical resolution and execution",
  () => {
    assert.match(
      migration,
      /resolution_id uuid PRIMARY KEY[\s\S]*REFERENCES public\.cing_artillery_shot_resolutions\(id\)/u
    );

    assert.match(
      migration,
      /execution_id uuid NOT NULL UNIQUE/u
    );

    assert.match(
      migration,
      /sample_count BETWEEN 1 AND 256/u
    );

    assert.match(
      migration,
      /jsonb_typeof\(samples\) = 'array'/u
    );
  }
);


test(
  "trajectory sidecar exposes no direct application table authority",
  () => {
    assert.match(
      migration,
      /ENABLE ROW LEVEL SECURITY/u
    );

    assert.match(
      migration,
      /REVOKE ALL[\s\S]*cing_artillery_shot_trajectory_presentations[\s\S]*FROM PUBLIC, anon, authenticated, service_role/u
    );
  }
);


test(
  "atomic wrapper preserves frozen settlement function and delegates gameplay authority",
  () => {
    assert.match(
      migration,
      /cing_artillery_commit_resolution_with_trajectory_fenced_atomic_v1/u
    );

    assert.match(
      migration,
      /RETURNS public\.cing_artillery_shot_resolutions/u
    );

    assert.match(
      migration,
      /public\.cing_artillery_commit_resolution_fenced_atomic\s*\(/u
    );

    assert.doesNotMatch(
      migration,
      /CREATE OR REPLACE FUNCTION\s+public\.cing_artillery_commit_resolution_fenced_atomic\s*\(/u
    );
  }
);


test(
  "wrapper validates bounded exact trajectory payload before settlement",
  () => {
    const validationIndex =
      migration.indexOf(
        "CING_ARTILLERY_TRAJECTORY_PRESENTATION_SAMPLE_COUNT_MISMATCH_V1"
      );

    const settlementIndex =
      migration.indexOf(
        "public.cing_artillery_commit_resolution_fenced_atomic("
      );

    assert.ok(
      validationIndex >= 0
    );

    assert.ok(
      settlementIndex >
        validationIndex
    );

    assert.match(
      migration,
      /sample_count[\s\S]*256/u
    );

    assert.match(
      migration,
      /\^-\?\(0\|\[1-9\]\[0-9\]\*\)\$/u
    );
  }
);


test(
  "wrapper persists trajectory after canonical settlement inside same transaction",
  () => {
    const settlementIndex =
      migration.indexOf(
        "public.cing_artillery_commit_resolution_fenced_atomic("
      );

    const insertIndex =
      migration.indexOf(
        "INSERT INTO\n    public.cing_artillery_shot_trajectory_presentations (",
        settlementIndex
      );

    assert.ok(
      settlementIndex >= 0
    );

    assert.ok(
      insertIndex >
        settlementIndex
    );

    assert.match(
      migration,
      /BEGIN;/u
    );

    assert.match(
      migration,
      /COMMIT;/u
    );
  }
);


test(
  "wrapper is idempotent and fails closed on presentation retry conflict",
  () => {
    assert.match(
      migration,
      /FOR UPDATE/u
    );

    assert.match(
      migration,
      /CING_ARTILLERY_TRAJECTORY_PRESENTATION_RETRY_CONFLICT_V1/u
    );

    assert.match(
      migration,
      /v_existing\.samples <>[\s\S]*v_samples/u
    );
  }
);


test(
  "only service role can execute trajectory settlement wrapper",
  () => {
    assert.match(
      migration,
      /REVOKE ALL[\s\S]*cing_artillery_commit_resolution_with_trajectory_fenced_atomic_v1[\s\S]*FROM PUBLIC, anon, authenticated/u
    );

    assert.match(
      migration,
      /GRANT EXECUTE[\s\S]*cing_artillery_commit_resolution_with_trajectory_fenced_atomic_v1[\s\S]*TO service_role/u
    );
  }
);
