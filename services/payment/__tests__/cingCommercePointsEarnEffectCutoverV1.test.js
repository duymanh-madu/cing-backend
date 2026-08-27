"use strict";

const test =
  require("node:test");
const assert =
  require("node:assert/strict");
const fs =
  require("node:fs");

const processor =
  fs.readFileSync(
    "services/payment/paidOrderSettlementProcessor.js",
    "utf8"
  );

test(
  "legacy Node point mutation and arithmetic remain removed",
  () => {
    assert.doesNotMatch(
      processor,
      /\baddPoints\b/
    );

    assert.doesNotMatch(
      processor,
      /\bcalculateOrderPoints\b/
    );

    assert.doesNotMatch(
      processor,
      /\bpointsToAdd\b/
    );
  }
);

test(
  "original after-hours path is the only points earn materializer",
  () => {
    const calls =
      processor.match(
        /materializeIfMissing:\s*true/g
      ) || [];

    assert.equal(
      calls.length,
      1
    );

    const start =
      processor.indexOf(
        "// ─── 5. Cộng điểm theo tier qua durable Commerce effect authority"
      );

    const end =
      processor.indexOf(
        "// ─── 5b.",
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const region =
      processor.slice(
        start,
        end
      );

    assert.match(
      region,
      /if\s*\(\s*isAfterHours\s*\)[\s\S]*runPointsEarnEffectBestEffort\([\s\S]*materializeIfMissing:[\s\S]*true/
    );
  }
);

test(
  "points earn materializes immutable tier through bounded V2 authority",
  () => {
    assert.match(
      processor,
      /async function materializePointsEarnInputSnapshot\([\s\S]*resolveCurrentPointsEarnTier\([\s\S]*cing_commerce_ensure_order_effect_input_v2[\s\S]*p_input_payload:[\s\S]*tier_key:[\s\S]*tierKey/
    );

    assert.match(
      processor,
      /materializePointsEarnInputSnapshot[\s\S]*getPointsEarnInputSnapshot/
    );
  }
);

test(
  "replay reads immutable snapshot and never resolves current crm tier",
  () => {
    const start =
      processor.indexOf(
        "async function buildReplayCompletionWithEffects("
      );

    const end =
      processor.indexOf(
        "async function findDurableOrderForPayment(",
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const replay =
      processor.slice(
        start,
        end
      );

    assert.match(
      replay,
      /runPointsEarnEffectBestEffort\(\s*order\s*\)/
    );

    assert.doesNotMatch(
      replay,
      /materializeIfMissing/
    );

    assert.doesNotMatch(
      replay,
      /resolveCurrentPointsEarnTier/
    );

    assert.doesNotMatch(
      replay,
      /crm_tier/
    );
  }
);

test(
  "non-materialized replay cannot create points earn eligibility",
  () => {
    assert.match(
      processor,
      /materializeIfMissing\s*=\s*false[\s\S]*materializeIfMissing[\s\S]*materializePointsEarnInputSnapshot[\s\S]*getPointsEarnInputSnapshot/
    );

    assert.match(
      processor,
      /if\s*\(\s*!snapshot\s*\)[\s\S]*reason:[\s\S]*"not_materialized"/
    );
  }
);

test(
  "durable snapshot reader is bounded RPC not direct effect-table access",
  () => {
    assert.match(
      processor,
      /cing_commerce_get_order_effect_input_v2/
    );

    assert.doesNotMatch(
      processor,
      /\.from\(\s*["']cing_commerce_order_effects["']\s*\)/
    );
  }
);

test(
  "PostgreSQL earn authority receives frozen tier snapshot",
  () => {
    assert.match(
      processor,
      /async function runPointsEarnEffect\([\s\S]*cing_commerce_apply_order_points_earn_v1[\s\S]*p_order_id:[\s\S]*orderNumericId[\s\S]*p_tier_key:[\s\S]*tierKey/
    );
  }
);

test(
  "tier resolver is reachable only through original materialization path",
  () => {
    const resolverCalls =
      processor.match(
        /await resolveCurrentPointsEarnTier\(/g
      ) || [];

    assert.equal(
      resolverCalls.length,
      1
    );

    const materializeStart =
      processor.indexOf(
        "async function materializePointsEarnInputSnapshot("
      );

    const executionStart =
      processor.indexOf(
        "async function runPointsEarnEffect(",
        materializeStart
      );

    const region =
      processor.slice(
        materializeStart,
        executionStart
      );

    assert.match(
      region,
      /resolveCurrentPointsEarnTier/
    );
  }
);
