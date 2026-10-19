"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const DB =
  "db/migrations/20261015110000_cing_kds_fabi_reconciliation_queue_v1.sql";

const SB =
  "docs/kds/draft-migrations/r1-original/20261015110000_cing_kds_fabi_reconciliation_queue_v1.sql";

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
  "queue identity is exact FABi branch plus transaction",
  () => {
    assert.match(
      sql,
      /primary key\s*\(\s*company_uid,\s*brand_uid,\s*store_uid,\s*tran_id\s*\)/i
    );
  }
);

test(
  "queue admits exact three reconciliation states",
  () => {
    assert.match(
      sql,
      /reconciliation_status in\s*\(\s*'pending_c03',\s*'ready',\s*'review_required'\s*\)/i
    );
  }
);

test(
  "pending state requires durable retry schedule",
  () => {
    assert.match(
      sql,
      /reconciliation_status = 'pending_c03'[\s\S]*next_reconcile_at is not null/i
    );
  }
);

test(
  "retry authority permits exact overnight deferral only",
  () => {
    const bounds =
      sql.match(
        /p_retry_delay_seconds >\s*(\d+)/g
      ) || [];

    assert.equal(
      bounds.length,
      2
    );

    for (const bound of bounds) {
      assert.match(bound, /32400/);
    }
  }
);

test(
  "terminal states cannot remain retry scheduled",
  () => {
    assert.match(
      sql,
      /reconciliation_status in\s*\(\s*'ready',\s*'review_required'\s*\)[\s\S]*next_reconcile_at is null/i
    );
  }
);

test(
  "direct table access is closed including service_role",
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
          `revoke all[\\s\\S]*on table public\\.cing_kds_fabi_reconciliation_queue_v1[\\s\\S]*from ${role}`,
          "i"
        )
      );
    }
  }
);

test(
  "changed result invalidates old retry claim and advances result version",
  () => {
    assert.match(
      sql,
      /result_version\s*=[\s\S]*case[\s\S]*state_fingerprint[\s\S]*then[\s\S]*\.result_version[\s\S]*else[\s\S]*\.result_version \+ 1/i
    );

    assert.match(
      sql,
      /claim_token\s*=[\s\S]*case[\s\S]*state_fingerprint[\s\S]*then[\s\S]*\.claim_token[\s\S]*else[\s\S]*null/i
    );

    assert.match(
      sql,
      /claim_expires_at\s*=[\s\S]*case[\s\S]*state_fingerprint[\s\S]*then[\s\S]*\.claim_expires_at[\s\S]*else[\s\S]*null/i
    );
  }
);

test(
  "exact overlap replay preserves retry version schedule and claim",
  () => {
    assert.match(
      sql,
      /reconciliation_status[\s\S]*is not distinct from[\s\S]*excluded\.reconciliation_status[\s\S]*state_fingerprint[\s\S]*is not distinct from[\s\S]*excluded\.state_fingerprint/i
    );

    assert.match(
      sql,
      /next_reconcile_at\s*=[\s\S]*case[\s\S]*state_fingerprint[\s\S]*then[\s\S]*\.next_reconcile_at[\s\S]*else[\s\S]*excluded\.next_reconcile_at/i
    );
  }
);

test(
  "due claim uses FOR UPDATE SKIP LOCKED",
  () => {
    assert.match(
      sql,
      /cing_kds_fabi_reconciliation_claim_due_v1[\s\S]*for update skip locked/i
    );
  }
);

test(
  "claim is branch isolated",
  () => {
    assert.match(
      sql,
      /q\.company_uid = btrim\(p_company_uid\)[\s\S]*q\.brand_uid = btrim\(p_brand_uid\)[\s\S]*q\.store_uid = btrim\(p_store_uid\)/i
    );
  }
);

test(
  "retry resolution is token fenced",
  () => {
    assert.match(
      sql,
      /v_row\.claim_token is distinct from[\s\S]*p_claim_token/i
    );
  }
);

test(
  "retry resolution is result-version fenced",
  () => {
    assert.match(
      sql,
      /v_row\.result_version <>[\s\S]*p_expected_result_version/i
    );
  }
);

test(
  "expired retry claim cannot resolve",
  () => {
    assert.match(
      sql,
      /claim_expires_at is null[\s\S]*claim_expires_at <= v_now/i
    );
  }
);

test(
  "all three RPCs are service_role execute only",
  () => {
    for (
      const name
      of [
        "cing_kds_fabi_reconciliation_result_put_v1",
        "cing_kds_fabi_reconciliation_claim_due_v1",
        "cing_kds_fabi_reconciliation_resolve_claim_v1"
      ]
    ) {
      assert.match(
        sql,
        new RegExp(
          `grant execute[\\s\\S]*${name}[\\s\\S]*to service_role`,
          "i"
        )
      );
    }
  }
);

test(
  "all queue RPCs use SECURITY DEFINER restricted search path",
  () => {
    const count =
      (
        sql.match(
          /security definer[\s\S]*?set search_path = public, pg_temp/gi
        ) || []
      ).length;

    assert.equal(
      count,
      3
    );
  }
);

test(
  "migration contains no runtime or scheduler activation",
  () => {
    /*
     * Strip SQL line comments first so descriptive words
     * cannot create false positives.
     *
     * Do NOT ban the generic word "schedule":
     * this authority legitimately contains retry scheduling
     * columns/constraints such as next_reconcile_at.
     *
     * We forbid actual activation primitives instead.
     */
    const executableSql =
      sql
        .split("\n")
        .map(line =>
          line.replace(
            /--.*$/,
            ""
          )
        )
        .join("\n");

    assert.doesNotMatch(
      executableSql,
      /setInterval\s*\(|setTimeout\s*\(|server\.listen\s*\(|app\.listen\s*\(/i
    );

    assert.doesNotMatch(
      executableSql,
      /\bcron\.schedule\s*\(|\bpg_cron\b/i
    );

    assert.doesNotMatch(
      executableSql,
      /\bcreate\s+trigger\b/i
    );
  }
);
