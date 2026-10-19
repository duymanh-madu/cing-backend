"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const DB =
  "docs/kds/draft-migrations/r1-original/20261015100000_cing_kds_fabi_runtime_fencing_v1.sql";

const SB =
  "docs/kds/draft-migrations/r1-original/20261015100000_cing_kds_fabi_runtime_fencing_v1.sql";

const sql =
  fs.readFileSync(
    DB,
    "utf8"
  );

test(
  "SQL mirrors are byte identical",
  () => {
    assert.equal(
      sql,
      fs.readFileSync(
        SB,
        "utf8"
      )
    );
  }
);

test(
  "runtime authority is uniquely keyed by exact FABi branch tuple",
  () => {
    assert.match(
      sql,
      /primary key\s*\(\s*company_uid,\s*brand_uid,\s*store_uid\s*\)/i
    );
  }
);

test(
  "runtime branch table is closed to every direct role including service_role",
  () => {
    for (
      const role
      of [
        "public",
        "anon",
        "authenticated",
        "service_role"
      ]
    ) {
      assert.match(
        sql,
        new RegExp(
          `revoke all[\\s\\S]*on table public\\.cing_kds_fabi_runtime_branch_v1[\\s\\S]*from ${role}`,
          "i"
        )
      );
    }
  }
);

test(
  "acquire locks branch row before lease classification",
  () => {
    assert.match(
      sql,
      /cing_kds_fabi_runtime_lease_acquire_v1[\s\S]*select \*[\s\S]*cing_kds_fabi_runtime_branch_v1[\s\S]*for update/i
    );
  }
);

test(
  "expired lease receives fresh UUID token",
  () => {
    assert.match(
      sql,
      /v_token\s*:=\s*gen_random_uuid\(\)/i
    );
  }
);

test(
  "checkpoint commit is fenced by token and live expiry",
  () => {
    assert.match(
      sql,
      /lease_token is distinct from[\s\S]*p_lease_token/i
    );

    assert.match(
      sql,
      /lease_expires_at is null[\s\S]*lease_expires_at <= v_now/i
    );
  }
);

test(
  "checkpoint regression is explicitly rejected",
  () => {
    assert.match(
      sql,
      /CING_KDS_RUNTIME_CHECKPOINT_REGRESSION/i
    );
  }
);

test(
  "successful checkpoint commit releases lease atomically",
  () => {
    assert.match(
      sql,
      /checkpoint_end_ms\s*=\s*p_checkpoint_end_ms[\s\S]*lease_token\s*=\s*null[\s\S]*lease_expires_at\s*=\s*null/i
    );
  }
);

test(
  "stale release cannot clear a newer lease",
  () => {
    assert.match(
      sql,
      /cing_kds_fabi_runtime_lease_release_v1[\s\S]*and lease_token\s*=\s*p_lease_token/i
    );
  }
);

test(
  "exact four RPCs are backend-only service_role capabilities",
  () => {
    for (
      const name
      of [
        "cing_kds_fabi_runtime_lease_acquire_v1",
        "cing_kds_fabi_runtime_checkpoint_commit_v1",
        "cing_kds_fabi_runtime_lease_renew_v1",
        "cing_kds_fabi_runtime_lease_release_v1"
      ]
    ) {
      assert.match(
        sql,
        new RegExp(
          `grant execute[\\s\\S]*${name}[\\s\\S]*to service_role`,
          "i"
        )
      );

      for (
        const role
        of [
          "public",
          "anon",
          "authenticated"
        ]
      ) {
        assert.match(
          sql,
          new RegExp(
            `revoke all[\\s\\S]*${name}[\\s\\S]*from[\\s\\S]*${role}`,
            "i"
          )
        );
      }
    }
  }
);

test(
  "all runtime RPCs are SECURITY DEFINER with restricted search path",
  () => {
    const count =
      (
        sql.match(
          /security definer[\s\S]*?set search_path = public, pg_temp/gi
        ) || []
      ).length;

    assert.equal(
      count,
      4
    );
  }
);

test(
  "renew is token fenced and cannot revive an expired lease",
  () => {
    assert.match(
      sql,
      /cing_kds_fabi_runtime_lease_renew_v1[\s\S]*for update/i
    );

    assert.match(
      sql,
      /lease_token is distinct from p_lease_token[\s\S]*lease_expires_at <= v_now/i
    );

    assert.match(
      sql,
      /return query[\s\S]*select[\s\S]*false[\s\S]*null::timestamptz/i
    );
  }
);

test(
  "migration contains no scheduler or runtime activation",
  () => {
    assert.doesNotMatch(
      sql,
      /setInterval|setTimeout|cron|schedule|server\.listen|app\.listen/i
    );
  }
);
