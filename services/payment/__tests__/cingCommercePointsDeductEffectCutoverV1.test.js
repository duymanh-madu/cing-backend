const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const processor = fs.readFileSync(
  path.resolve(
    __dirname,
    "../paidOrderSettlementProcessor.js"
  ),
  "utf8"
);

test(
  "points deduct uses durable commerce effect executor",
  () => {
    assert.match(
      processor,
      /runPointsDeductEffect[\s\S]*executeCommerceOrderEffect[\s\S]*effectKey:\s*"points_deduct"/
    );
  }
);

test(
  "points deduct delegates arithmetic to PostgreSQL authority",
  () => {
    assert.match(
      processor,
      /runPointsDeductEffect[\s\S]*cing_commerce_apply_order_points_deduct_v1[\s\S]*p_order_id/
    );
  }
);

test(
  "points deduct business execution occurs only inside durable executor callback",
  () => {
    const start =
      processor.indexOf(
        "async function runPointsDeductEffect("
      );

    const end =
      processor.indexOf(
        "async function runPointsDeductEffectBestEffort(",
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const region =
      processor.slice(
        start,
        end
      );

    const executor =
      region.indexOf(
        "executeCommerceOrderEffect"
      );

    const rpc =
      region.indexOf(
        "cing_commerce_apply_order_points_deduct_v1"
      );

    assert.ok(executor >= 0);
    assert.ok(rpc > executor);
  }
);

test(
  "legacy Node loyalty deduction is removed from paid-order processor",
  () => {
    assert.doesNotMatch(
      processor,
      /\bdeductPoints\b/
    );

    assert.doesNotMatch(
      processor,
      /const pointsUsed = snap\.points_used/
    );
  }
);

test(
  "new order executes durable points deduction effect",
  () => {
    const legacyPosition =
      processor.indexOf(
        "// ─── 4. Trừ điểm"
      );

    assert.ok(
      legacyPosition >= 0
    );

    const region =
      processor.slice(
        legacyPosition,
        legacyPosition + 500
      );

    assert.match(
      region,
      /runPointsDeductEffectBestEffort\(\s*order\s*\)/
    );
  }
);

test(
  "durable replay retries points deduction effect",
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

    const region =
      processor.slice(
        start,
        end
      );

    assert.match(
      region,
      /runGamePlaysEffectBestEffort\(\s*order\s*\)[\s\S]*runPointsDeductEffectBestEffort\(\s*order\s*\)/
    );
  }
);

test(
  "points earn remains on legacy path at this checkpoint",
  () => {
    assert.match(
      processor,
      /\baddPoints\b/
    );

    assert.doesNotMatch(
      processor,
      /runPointsEarnEffect/
    );
  }
);
