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
      "db/migrations/20260901_z_cing_artillery_result_stream_trajectory_read_v2.sql"
    ),
    "utf8"
  );

const repositorySource =
  fs.readFileSync(
    path.join(
      __dirname,
      "../repositories/cingArtilleryResultStreamRepository.js"
    ),
    "utf8"
  );


test(
  "V2 result reader leaves frozen V1 reader untouched",
  () => {
    assert.match(
      migration,
      /CREATE OR REPLACE FUNCTION\s+public\.cing_artillery_read_result_stream_authorized_v2\s*\(/u
    );

    assert.doesNotMatch(
      migration,
      /CREATE OR REPLACE FUNCTION\s+public\.cing_artillery_read_result_stream_authorized_v1\s*\(/u
    );
  }
);


test(
  "V2 preserves participant authorization and bounded cursor semantics",
  () => {
    assert.match(
      migration,
      /cing_artillery_match_runtimes/u
    );

    assert.match(
      migration,
      /player_one_account_id/u
    );

    assert.match(
      migration,
      /player_two_account_id/u
    );

    assert.match(
      migration,
      /\^\(0\|\[1-9\]\[0-9\]\*\)\$/u
    );

    assert.match(
      migration,
      /p_limit > 100/u
    );
  }
);


test(
  "V2 fails closed when candidate durable result lacks matching trajectory",
  () => {
    assert.match(
      migration,
      /LEFT JOIN\s+public\.cing_artillery_shot_trajectory_presentations AS t/u
    );

    assert.match(
      migration,
      /t\.resolution_id IS NULL/u
    );

    assert.match(
      migration,
      /t\.execution_id IS DISTINCT FROM\s+s\.execution_id/u
    );

    assert.match(
      migration,
      /CING_ARTILLERY_RESULT_STREAM_TRAJECTORY_INCONSISTENT_V2/u
    );
  }
);


test(
  "V2 canonical read requires inner joined one-to-one trajectory sidecar",
  () => {
    assert.match(
      migration,
      /JOIN\s+public\.cing_artillery_shot_trajectory_presentations AS t[\s\S]*t\.resolution_id =\s*r\.id[\s\S]*t\.execution_id =\s*r\.execution_id/u
    );
  }
);


test(
  "V2 returns bounded trajectory presentation without replacing gameplay result authority",
  () => {
    assert.match(
      migration,
      /trajectory_presentation jsonb/u
    );

    assert.match(
      migration,
      /jsonb_build_object\([\s\S]*'physics_fixed_scale'[\s\S]*'sample_stride'[\s\S]*'sample_count'[\s\S]*'samples'/u
    );

    assert.match(
      migration,
      /public\.cing_artillery_shot_resolutions AS r/u
    );

    assert.match(
      migration,
      /r\.damage::text/u
    );

    assert.match(
      migration,
      /r\.outcome/u
    );
  }
);


test(
  "V2 remains service-role-only and read-only",
  () => {
    assert.match(
      migration,
      /REVOKE ALL[\s\S]*cing_artillery_read_result_stream_authorized_v2[\s\S]*FROM PUBLIC, anon, authenticated, service_role/u
    );

    assert.match(
      migration,
      /GRANT EXECUTE[\s\S]*cing_artillery_read_result_stream_authorized_v2[\s\S]*TO service_role/u
    );

    assert.doesNotMatch(
      migration,
      /\bINSERT\s+INTO\b/u
    );

    assert.doesNotMatch(
      migration,
      /\bUPDATE\s+public\./u
    );

    assert.doesNotMatch(
      migration,
      /\bDELETE\s+FROM\b/u
    );
  }
);


test(
  "repository reads V2 while durable stream head remains V1",
  () => {
    assert.match(
      repositorySource,
      /cing_artillery_read_result_stream_authorized_v2/u
    );

    assert.match(
      repositorySource,
      /cing_artillery_read_result_stream_head_authorized_v1/u
    );

    assert.doesNotMatch(
      repositorySource,
      /cing_artillery_read_result_stream_authorized_v1/u
    );
  }
);
