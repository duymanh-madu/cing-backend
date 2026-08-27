const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const migration =
  fs.readFileSync(
    "db/migrations/20260827_cing_commerce_post_order_effect_authority_v1.sql",
    "utf8"
  );

test(
  "commerce effects have durable per-order uniqueness",
  () => {
    assert.match(
      migration,
      /create unique index[\s\S]*cing_commerce_order_effects_order_effect_uq[\s\S]*order_id[\s\S]*effect_key/i
    );
  }
);

test(
  "commerce effect catalog covers critical post-order effects",
  () => {
    for (const key of [
      "ipos_delivery",
      "game_plays",
      "daily_mission",
      "partner_spending",
      "local_spending",
      "points_deduct",
      "points_earn",
    ]) {
      assert.match(
        migration,
        new RegExp(
          `'${key}'`,
          "i"
        )
      );
    }
  }
);

test(
  "effect claim uses row lock and durable lease token",
  () => {
    assert.match(
      migration,
      /cing_commerce_claim_order_effect_v1[\s\S]*for update/i
    );

    assert.match(
      migration,
      /cing_commerce_claim_order_effect_v1[\s\S]*gen_random_uuid/i
    );

    assert.match(
      migration,
      /lease_expires_at/i
    );

    assert.match(
      migration,
      /attempt_count[\s\S]*attempt_count\s*\+\s*1/i
    );
  }
);

test(
  "completed effects are terminal",
  () => {
    assert.match(
      migration,
      /if v_effect\.status = 'completed' then[\s\S]*return v_effect/i
    );
  }
);

test(
  "stale workers cannot complete reclaimed effects",
  () => {
    assert.match(
      migration,
      /cing_commerce_complete_order_effect_v1[\s\S]*claim_token[\s\S]*is distinct from p_claim_token[\s\S]*COMMERCE_EFFECT_CLAIM_MISMATCH/i
    );
  }
);

test(
  "failed effects release lease and remain reclaimable",
  () => {
    assert.match(
      migration,
      /cing_commerce_fail_order_effect_v1[\s\S]*status = 'failed'[\s\S]*claim_token = null[\s\S]*lease_expires_at = null/i
    );

    assert.match(
      migration,
      /v_effect\.status = 'processing'[\s\S]*lease_expires_at > v_now[\s\S]*return v_effect/i
    );
  }
);

test(
  "effect table is not directly mutable by application roles",
  () => {
    assert.match(
      migration,
      /revoke all[\s\S]*cing_commerce_order_effects[\s\S]*from public,\s*anon,\s*authenticated/i
    );

    assert.doesNotMatch(
      migration,
      /grant\s+(insert|update|delete)[\s\S]*cing_commerce_order_effects[\s\S]*service_role/i
    );
  }
);

test(
  "bounded lifecycle RPCs are backend-only",
  () => {
    for (const fn of [
      "cing_commerce_ensure_order_effect_v1",
      "cing_commerce_claim_order_effect_v1",
      "cing_commerce_complete_order_effect_v1",
      "cing_commerce_fail_order_effect_v1",
    ]) {
      assert.match(
        migration,
        new RegExp(
          `grant execute[\\s\\S]*${fn}[\\s\\S]*to service_role`,
          "i"
        )
      );
    }
  }
);

test(
  "claim result explicitly distinguishes lease ownership",
  () => {
    assert.match(
      migration,
      /cing_commerce_claim_order_effect_v1[\s\S]*returns table\s*\([\s\S]*acquired boolean/i
    );

    assert.match(
      migration,
      /status = 'completed'[\s\S]*false[\s\S]*return/i
    );

    assert.match(
      migration,
      /status = 'processing'[\s\S]*lease_expires_at > v_now[\s\S]*false[\s\S]*return/i
    );

    assert.match(
      migration,
      /gen_random_uuid\(\)[\s\S]*return query[\s\S]*true/i
    );
  }
);

test(
  "entire post-order authority migration is one PostgreSQL transaction",
  () => {
    const commits =
      migration.match(
        /^\s*commit;\s*$/gim
      ) || [];

    assert.equal(
      commits.length,
      1
    );

    assert.match(
      migration,
      /^\s*begin;\s*$/im
    );

    const playAuthority =
      migration.indexOf(
        "ORDER-SPEND GAME PLAY AWARD AUTHORITY V1"
      );

    const commit =
      migration.toLowerCase()
        .lastIndexOf(
          "commit;"
        );

    assert.ok(
      playAuthority >= 0
    );

    assert.ok(
      commit > playAuthority
    );

    assert.equal(
      migration
        .slice(commit)
        .trim()
        .toLowerCase(),
      "commit;"
    );
  }
);
