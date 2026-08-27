"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync(
  "db/migrations/20260827_cing_commerce_order_effect_input_snapshot_v2.sql",
  "utf8"
);

test(
  "V2 adds durable effect input payload without modifying orders",
  () => {
    assert.match(
      migration,
      /alter table[\s\S]*public\.cing_commerce_order_effects[\s\S]*add column if not exists[\s\S]*input_payload jsonb/i
    );

    assert.doesNotMatch(
      migration,
      /alter table[\s\S]*public\.orders[\s\S]*add column/i
    );
  }
);

test(
  "points earn tier is materialized atomically with effect",
  () => {
    assert.match(
      migration,
      /cing_commerce_ensure_order_effect_input_v2[\s\S]*insert into[\s\S]*public\.cing_commerce_order_effects[\s\S]*order_id[\s\S]*effect_key[\s\S]*input_payload/i
    );
  }
);

test(
  "materialized effect input is immutable across retry",
  () => {
    assert.match(
      migration,
      /on conflict[\s\S]*do nothing[\s\S]*for update[\s\S]*input_payload[\s\S]*is distinct from p_input_payload[\s\S]*COMMERCE_EFFECT_INPUT_CONFLICT/i
    );
  }
);

test(
  "points earn accepts only canonical tier snapshot",
  () => {
    for (const tier of [
      "member",
      "loyal",
      "silver",
      "gold",
      "diamond",
      "partner",
      "loyal_partner",
    ]) {
      assert.match(
        migration,
        new RegExp(`'${tier}'`)
      );
    }

    assert.match(
      migration,
      /COMMERCE_POINTS_EARN_INPUT_INVALID/
    );
  }
);

test(
  "V2 exposes bounded immutable input read authority",
  () => {
    assert.match(
      migration,
      /cing_commerce_get_order_effect_input_v2[\s\S]*select e\.input_payload[\s\S]*effect_key = p_effect_key/i
    );
  }
);

test(
  "V2 authorities are backend only",
  () => {
    for (const name of [
      "cing_commerce_ensure_order_effect_input_v2",
      "cing_commerce_get_order_effect_input_v2",
    ]) {
      assert.match(
        migration,
        new RegExp(
          `revoke all on function[\\s\\S]*public\\.${name}[\\s\\S]*from public, anon, authenticated`,
          "i"
        )
      );

      assert.match(
        migration,
        new RegExp(
          `grant execute on function[\\s\\S]*public\\.${name}[\\s\\S]*to service_role`,
          "i"
        )
      );
    }
  }
);

test(
  "migration fails closed on pre-existing unsnapshotted points earn effects",
  () => {
    assert.match(
      migration,
      /effect_key = 'points_earn'[\s\S]*input_payload is null[\s\S]*COMMERCE_POINTS_EARN_LEGACY_EFFECT_INPUT_MISSING/i
    );
  }
);

test(
  "V2 migration is one PostgreSQL transaction",
  () => {
    assert.equal(
      (migration.match(/\bbegin\s*;/gi) || []).length,
      1
    );

    assert.equal(
      (migration.match(/\bcommit\s*;/gi) || []).length,
      1
    );

    assert.match(
      migration.trim(),
      /^begin;[\s\S]*commit;$/i
    );
  }
);

test(
  "V2 uses production-supported JSONB object cardinality",
  () => {
    assert.doesNotMatch(
      migration,
      /jsonb_object_length/i
    );

    assert.match(
      migration,
      /select count\(\*\)[\s\S]*from jsonb_object_keys\([\s\S]*p_input_payload[\s\S]*\)\s*<> 1/i
    );
  }
);
