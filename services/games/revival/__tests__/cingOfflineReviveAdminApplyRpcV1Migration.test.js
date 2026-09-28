"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(
  __dirname,
  "../../../.."
);

const db = path.join(
  root,
  "db/migrations/20260923_cing_offline_revive_admin_apply_rpc_v1.sql"
);

const sb = path.join(
  root,
  "supabase/migrations/20260923123000_cing_offline_revive_admin_apply_rpc_v1.sql"
);

const raw = fs.readFileSync(
  db,
  "utf8"
);

const sql = raw
  .replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  )
  .replace(
    /--[^\n]*/g,
    ""
  );

test(
  "Admin Apply SQL mirrors are identical",
  () => {
    assert.equal(
      raw,
      fs.readFileSync(
        sb,
        "utf8"
      )
    );
  }
);

test(
  "RPC has a transaction boundary",
  () => {
    assert.match(
      sql,
      /^\s*begin;/i
    );

    assert.match(
      sql,
      /commit;\s*$/i
    );
  }
);

test(
  "request ledger has one UUID authority",
  () => {
    assert.match(
      sql,
      /apply_request_id uuid primary key/i
    );

    assert.match(
      sql,
      /full_challenges jsonb not null/i
    );

    assert.match(
      sql,
      /revival_challenges jsonb not null/i
    );
  }
);

test(
  "Super Admin is rechecked in DB",
  () => {
    assert.match(
      sql,
      /from public\.admins a[\s\S]*a\.active = true[\s\S]*a\.role = 'super_admin'[\s\S]*for share/i
    );
  }
);

test(
  "app config row serializes apply",
  () => {
    assert.match(
      sql,
      /from public\.app_configs c[\s\S]*where c\.id = 1[\s\S]*for update/i
    );
  }
);

test(
  "same request with different payload conflicts",
  () => {
    assert.match(
      sql,
      /v_existing\.full_challenges[\s\S]*is distinct from[\s\S]*p_full_challenges/i
    );

    assert.match(
      sql,
      /v_existing\.revival_challenges[\s\S]*is distinct from[\s\S]*p_revival_challenges/i
    );

    assert.match(
      sql,
      /REVIVAL_APPLY_REQUEST_CONFLICT/
    );
  }
);

test(
  "Admin applies exactly two Revival games",
  () => {
    assert.match(
      sql,
      /jsonb_array_length\(\s*p_revival_challenges\s*\)\s*<> 2/i
    );

    assert.match(
      sql,
      /'black-pearl-rush'/i
    );

    assert.match(
      sql,
      /'cing-stack-tower'/i
    );
  }
);

test(
  "complete Admin list is persisted",
  () => {
    assert.match(
      sql,
      /daily_challenge_config\s*=\s*jsonb_set\(\s*coalesce\(\s*v_config\.daily_challenge_config,\s*'\{\}'::jsonb\s*\),\s*'\{challenges\}',\s*p_full_challenges,\s*true\s*\)/i
    );
  }
);

test(
  "completed daily challenge is not rewritten",
  () => {
    assert.match(
      sql,
      /elsif not coalesce\(\s*v_completed,\s*false\s*\) then/i
    );
  }
);

test(
  "disabled challenge creates tombstone",
  () => {
    assert.match(
      sql,
      /v_challenge_id := null;[\s\S]*insert into\s+public\.cing_offline_revive_challenge_snapshots/i
    );
  }
);

test(
  "snapshot and request share apply identity",
  () => {
    assert.match(
      sql,
      /insert into\s+public\.cing_offline_revive_challenge_snapshots/i
    );

    assert.match(
      sql,
      /insert into\s+public\.cing_offline_revive_admin_applies/i
    );
  }
);

test(
  "RPC is service-role only",
  () => {
    assert.match(
      sql,
      /grant execute[\s\S]*cing_offline_revive_admin_apply_v1[\s\S]*to service_role/i
    );

    assert.match(
      sql,
      /revoke all[\s\S]*cing_offline_revive_admin_apply_v1[\s\S]*from\s+public,\s*anon,\s*authenticated/i
    );
  }
);

test(
  "Admin Apply does not mutate financial ledger",
  () => {
    assert.doesNotMatch(
      sql,
      /insert into\s+public\.point_transactions/i
    );

    assert.doesNotMatch(
      sql,
      /update\s+public\.players/i
    );

    assert.doesNotMatch(
      sql,
      /complete_daily_challenge_atomic\s*\(/i
    );
  }
);

test(
  "Admin Apply preserves unrelated config keys",
  () => {
    assert.match(
      sql,
      /jsonb_set\(\s*coalesce\(\s*v_config\.daily_challenge_config,\s*'\{\}'::jsonb\s*\),\s*'\{challenges\}'/i
    );

    assert.doesNotMatch(
      sql,
      /daily_challenge_config\s*=\s*jsonb_build_object\(/i
    );
  }
);
