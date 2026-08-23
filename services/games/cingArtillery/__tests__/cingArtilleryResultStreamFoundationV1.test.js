"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const {
  test,
} =
  require("node:test");


const MIGRATION_PATH =
  path.resolve(
    __dirname,
    "../../../..",
    "db/migrations/20260824_cing_artillery_result_stream_foundation_v1.sql"
  );


function source() {
  return fs.readFileSync(
    MIGRATION_PATH,
    "utf8"
  );
}


function compact(value) {
  return String(value)
    .replace(/\s+/gu, " ")
    .trim();
}


test(
  "result stream owns one generated monotonic bigint cursor",
  () => {
    const sql =
      compact(source());

    assert.match(
      sql,
      /result_sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY/iu
    );

    assert.equal(
      (
        sql.match(
          /GENERATED ALWAYS AS IDENTITY/giu
        ) || []
      ).length,
      1
    );
  }
);


test(
  "result stream stores ordering and canonical identities without duplicating gameplay payload",
  () => {
    const sql =
      source();

    const tableStart =
      sql.indexOf(
        "CREATE TABLE\n  public.cing_artillery_result_stream"
      );

    const tableEnd =
      sql.indexOf(
        "-- =====================================================\n-- RESUME / CATCH-UP QUERY SUPPORT",
        tableStart
      );

    assert.ok(
      tableStart >= 0 &&
      tableEnd > tableStart
    );

    const tableSql =
      sql.slice(
        tableStart,
        tableEnd
      );

    for (
      const field
      of [
        "resolution_id",
        "execution_id",
        "shot_command_id",
        "combat_state_id",
        "turn_state_id",
        "match_runtime_id",
        "match_id",
        "turn_number",
        "created_at",
      ]
    ) {
      assert.match(
        tableSql,
        new RegExp(
          `\\b${field}\\b`,
          "u"
        )
      );
    }

    for (
      const forbidden
      of [
        "outcome",
        "damage",
        "impact_x",
        "impact_y",
        "target_account_id",
        "physics_version",
      ]
    ) {
      assert.doesNotMatch(
        tableSql,
        new RegExp(
          `\\b${forbidden}\\b`,
          "u"
        )
      );
    }
  }
);


test(
  "result stream has one-to-one canonical shot identity constraints",
  () => {
    const sql =
      compact(source());

    assert.match(
      sql,
      /UNIQUE \( resolution_id \)/iu
    );

    assert.match(
      sql,
      /UNIQUE \( execution_id \)/iu
    );

    assert.match(
      sql,
      /UNIQUE \( shot_command_id \)/iu
    );

    assert.match(
      sql,
      /UNIQUE \( combat_state_id, turn_number \)/iu
    );
  }
);


test(
  "resume read path is indexed by match and monotonic sequence",
  () => {
    const sql =
      compact(source());

    assert.match(
      sql,
      /cing_artillery_result_stream_match_sequence_idx ON public\.cing_artillery_result_stream \( match_id, result_sequence \)/iu
    );

    assert.match(
      sql,
      /cing_artillery_result_stream_runtime_sequence_idx ON public\.cing_artillery_result_stream \( match_runtime_id, result_sequence \)/iu
    );
  }
);


test(
  "canonical resolution table is locked before stream bootstrap",
  () => {
    const sql =
      source();

    const lock =
      sql.indexOf(
        "LOCK TABLE\n  public.cing_artillery_shot_resolutions"
      );

    const create =
      sql.indexOf(
        "CREATE TABLE\n  public.cing_artillery_result_stream"
      );

    assert.ok(
      lock >= 0
    );

    assert.ok(
      create > lock
    );

    assert.match(
      compact(
        sql.slice(
          lock,
          create
        )
      ),
      /IN SHARE ROW EXCLUSIVE MODE/iu
    );
  }
);


test(
  "stream capture is an AFTER INSERT trigger on canonical resolutions",
  () => {
    const sql =
      compact(source());

    assert.match(
      sql,
      /CREATE TRIGGER cing_artillery_shot_resolution_result_stream_after_insert_v1 AFTER INSERT ON public\.cing_artillery_shot_resolutions FOR EACH ROW EXECUTE FUNCTION public\.cing_artillery_capture_result_stream_private_v1\(\)/iu
    );
  }
);


test(
  "capture authority is hardened SECURITY DEFINER and private",
  () => {
    const sql =
      compact(source());

    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_capture_result_stream_private_v1\(\) RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public/iu
    );

    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.cing_artillery_capture_result_stream_private_v1\(\) FROM PUBLIC, anon, authenticated, service_role/iu
    );
  }
);


test(
  "capture inserts identity only and never mutates canonical gameplay tables",
  () => {
    const sql =
      source();

    const functionStart =
      sql.indexOf(
        "CREATE OR REPLACE FUNCTION\n  public.cing_artillery_capture_result_stream_private_v1()"
      );

    const functionEnd =
      sql.indexOf(
        "REVOKE ALL\nON FUNCTION",
        functionStart
      );

    assert.ok(
      functionStart >= 0 &&
      functionEnd > functionStart
    );

    const functionSql =
      sql.slice(
        functionStart,
        functionEnd
      );

    assert.match(
      compact(functionSql),
      /INSERT INTO public\.cing_artillery_result_stream/iu
    );

    assert.doesNotMatch(
      functionSql,
      /\bUPDATE\b/iu
    );

    assert.doesNotMatch(
      functionSql,
      /\bDELETE\b/iu
    );

    assert.doesNotMatch(
      functionSql,
      /cing_artillery_commit_resolution_fenced_atomic/iu
    );

    assert.doesNotMatch(
      functionSql,
      /cing_artillery_advance_turn_private/iu
    );

    assert.doesNotMatch(
      functionSql,
      /cing_artillery_complete_combat_private/iu
    );
  }
);


test(
  "service role has SELECT-only result stream table authority",
  () => {
    const sql =
      compact(source());

    assert.match(
      sql,
      /ALTER TABLE public\.cing_artillery_result_stream ENABLE ROW LEVEL SECURITY/iu
    );

    assert.match(
      sql,
      /REVOKE ALL ON TABLE public\.cing_artillery_result_stream FROM service_role/iu
    );

    assert.match(
      sql,
      /GRANT SELECT ON TABLE public\.cing_artillery_result_stream TO service_role/iu
    );

    assert.match(
      sql,
      /REVOKE ALL ON SEQUENCE public\.cing_artillery_result_stream_result_sequence_seq FROM service_role/iu
    );

    assert.doesNotMatch(
      sql,
      /GRANT (INSERT|UPDATE|DELETE|USAGE) .* TO service_role/iu
    );
  }
);


test(
  "historical backfill is bounded to canonical resolution identity and ordered deterministically",
  () => {
    const sql =
      compact(source());

    assert.match(
      sql,
      /INSERT INTO public\.cing_artillery_result_stream \( resolution_id, execution_id, shot_command_id, combat_state_id, turn_state_id, match_runtime_id, match_id, turn_number, created_at \) SELECT r\.id, r\.execution_id, r\.shot_command_id, r\.combat_state_id, r\.turn_state_id, r\.match_runtime_id, r\.match_id, r\.turn_number, r\.resolved_at FROM public\.cing_artillery_shot_resolutions AS r ORDER BY r\.resolved_at ASC, r\.created_at ASC, r\.id ASC/iu
    );
  }
);


test(
  "migration does not rewrite fenced gameplay authority",
  () => {
    const sql =
      source();

    assert.doesNotMatch(
      sql,
      /CREATE OR REPLACE FUNCTION\s+public\.cing_artillery_commit_resolution_fenced_atomic/iu
    );
  }
);


test(
  "database foundation owns no socket or database notification transport",
  () => {
    const sql =
      source()
        .replace(
          /--[^\n]*/gu,
          ""
        );

    assert.doesNotMatch(
      sql,
      /\bpg_notify\b/iu
    );

    assert.doesNotMatch(
      sql,
      /\bNOTIFY\b/iu
    );

    assert.doesNotMatch(
      sql,
      /socket\.io/iu
    );
  }
);
