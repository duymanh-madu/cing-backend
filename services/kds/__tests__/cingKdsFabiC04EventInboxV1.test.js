"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const stamp =
  "20261015090000";

const name =
  "cing_kds_fabi_c04_event_inbox_v1.sql";

const archivePath =
  path.join(
    process.cwd(),
    "docs/kds/draft-migrations/r1-original",
    `${stamp}_${name}`
  );

const db =
  fs.readFileSync(
    archivePath,
    "utf8"
  );

function has(pattern) {
  return pattern.test(db);
}

test(
  "Archived C04 draft is byte-preserved",
  () => {
    const digest =
      crypto
        .createHash("sha256")
        .update(db)
        .digest("hex");

    assert.equal(
      digest,
      "864b9b3cc70142c73f53fe65484ed30b78e210fc1e7c5239abb2a0788c7e2ad5"
    );
  }
);

test(
  "migration creates dedicated C04 durable inbox",
  () => {
    assert.match(
      db,
      /create table if not exists public\.cing_kds_fabi_c04_event_inbox/i
    );
  }
);

test(
  "event fingerprint is persistently unique",
  () => {
    assert.match(
      db,
      /unique\s*\(\s*event_fingerprint\s*\)/i
    );
  }
);

test(
  "only normalized proven C04 signed-delta log types are admitted",
  () => {
    assert.match(
      db,
      /source = 'fabi_c04_sale_change_log'/i
    );

    assert.match(
      db,
      /schema_version = 'cing_kds_fabi_c04_event_v1'/i
    );

    assert.match(
      db,
      /source_log_type in \('SALE_CHANGE', 'SALE_MERGE_ORDER'\)/i
    );
  }
);

test(
  "raw upstream payload column is not created",
  () => {
    assert.doesNotMatch(
      db,
      /\braw_payload\b/i
    );

    assert.doesNotMatch(
      db,
      /\bupstream_payload\b/i
    );
  }
);

test(
  "normalized event is required to remain signed delta",
  () => {
    assert.match(
      db,
      /quantity_model.*signed_delta/is
    );
  }
);

test(
  "payment authority is explicitly forbidden",
  () => {
    assert.match(
      db,
      /payment_authority/is
    );

    assert.match(
      db,
      /C04_INBOX_PAYMENT_AUTHORITY_FORBIDDEN/i
    );
  }
);

test(
  "final state authority is explicitly forbidden",
  () => {
    assert.match(
      db,
      /final_state_authority/is
    );

    assert.match(
      db,
      /C04_INBOX_FINAL_AUTHORITY_FORBIDDEN/i
    );
  }
);

test(
  "idempotent writer is SECURITY DEFINER with restricted search path",
  () => {
    assert.match(
      db,
      /create or replace function public\.cing_kds_fabi_c04_event_inbox_put_v1/i
    );

    assert.match(
      db,
      /security definer/i
    );

    assert.match(
      db,
      /set search_path = public, pg_temp/i
    );
  }
);

test(
  "writer locks existing fingerprint row before duplicate decision",
  () => {
    assert.match(
      db,
      /where event_fingerprint = p_event_fingerprint[\s\S]*for update/i
    );
  }
);

test(
  "exact replay increments observation count",
  () => {
    assert.match(
      db,
      /observation_count = observation_count \+ 1/i
    );

    assert.match(
      db,
      /'duplicate'::text/i
    );
  }
);

test(
  "fingerprint conflict never overwrites normalized event",
  () => {
    assert.match(
      db,
      /normalized_event is distinct from p_normalized_event/i
    );

    assert.match(
      db,
      /'conflict'::text/i
    );

    const conflictSection =
      db.slice(
        db.indexOf(
          "if v_existing.source is distinct"
        ),
        db.indexOf(
          "if v_existing.source is distinct"
        ) + 1800
      );

    assert.doesNotMatch(
      conflictSection,
      /normalized_event\s*=/i
    );
  }
);

test(
  "new event returns inserted state",
  () => {
    assert.match(
      db,
      /'inserted'::text/i
    );
  }
);

test(
  "client roles have no table access",
  () => {
    for (const role of [
      "public",
      "anon",
      "authenticated"
    ]) {
      assert.match(
        db,
        new RegExp(
          `revoke all[\\s\\S]*?on table[\\s\\S]*?cing_kds_fabi_c04_event_inbox[\\s\\S]*?from ${role}`,
          "i"
        )
      );
    }
  }
);

test(
  "client roles have no function execution",
  () => {
    for (const role of [
      "public",
      "anon",
      "authenticated"
    ]) {
      assert.match(
        db,
        new RegExp(
          `revoke all[\\s\\S]*?on function public\\.cing_kds_fabi_c04_event_inbox_put_v1[\\s\\S]*?from ${role}`,
          "i"
        )
      );
    }
  }
);

test(
  "RLS is enabled",
  () => {
    assert.match(
      db,
      /alter table[\s\S]*cing_kds_fabi_c04_event_inbox[\s\S]*enable row level security/i
    );
  }
);

test(
  "migration contains no runtime activation or scheduler",
  () => {
    assert.doesNotMatch(
      db,
      /\bcron\b/i
    );

    assert.doesNotMatch(
      db,
      /\bpg_cron\b/i
    );

    assert.doesNotMatch(
      db,
      /\bhttp_request\b/i
    );

    assert.doesNotMatch(
      db,
      /\bnet\.http\b/i
    );
  }
);

test(
  "migration checksum is deterministic",
  () => {
    const a =
      crypto
        .createHash("sha256")
        .update(db)
        .digest("hex");

    const b =
      crypto
        .createHash("sha256")
        .update(db)
        .digest("hex");

    assert.match(
      a,
      /^[a-f0-9]{64}$/
    );

    assert.equal(a, b);
  }
);

test(
  "brand-new concurrent fingerprint uses INSERT ON CONFLICT instead of SELECT-first race",
  () => {
    assert.match(
      db,
      /insert into public\.cing_kds_fabi_c04_event_inbox[\s\S]*on conflict\s*\(\s*event_fingerprint\s*\)\s*do nothing[\s\S]*returning \*/i
    );

    const conflictIndex =
      db.search(
        /on conflict\s*\(\s*event_fingerprint\s*\)\s*do nothing/i
      );

    const lockIndex =
      db.search(
        /where event_fingerprint = p_event_fingerprint[\s\S]*for update/i
      );

    assert.ok(
      conflictIndex >= 0,
      "ON CONFLICT path missing"
    );

    assert.ok(
      lockIndex > conflictIndex,
      "row lock must classify only after first-insert attempt"
    );
  }
);

test(
  "concurrent loser re-reads and locks durable fingerprint row",
  () => {
    assert.match(
      db,
      /select \*[\s\S]*where event_fingerprint = p_event_fingerprint[\s\S]*for update/i
    );

    assert.match(
      db,
      /C04_INBOX_CONFLICT_ROW_MISSING/i
    );
  }
);

test(
  "concurrent exact replay still becomes duplicate",
  () => {
    assert.match(
      db,
      /observation_count = observation_count \+ 1/i
    );

    assert.match(
      db,
      /'duplicate'::text/i
    );
  }
);

test(
  "concurrent changed payload remains conflict and cannot overwrite original",
  () => {
    assert.match(
      db,
      /normalized_event is distinct from p_normalized_event/i
    );

    assert.match(
      db,
      /'conflict'::text/i
    );

    const conflictStart =
      db.indexOf(
        "if v_existing.source is distinct"
      );

    assert.ok(
      conflictStart >= 0
    );

    const conflictSlice =
      db.slice(
        conflictStart,
        conflictStart + 1800
      );

    assert.doesNotMatch(
      conflictSlice,
      /normalized_event\s*=/i
    );
  }
);
