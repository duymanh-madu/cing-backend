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

const executor =
  fs.readFileSync(
    "services/payment/commerceOrderEffectExecutor.js",
    "utf8"
  );

test(
  "paid-order game plays use durable effect executor",
  () => {
    assert.match(
      processor,
      /executeCommerceOrderEffect\(\{[\s\S]*effectKey:\s*"game_plays"[\s\S]*cing_commerce_award_order_spend_plays_v1/
    );
  }
);

test(
  "game-play PostgreSQL authority receives canonical order identity",
  () => {
    assert.match(
      processor,
      /cing_commerce_award_order_spend_plays_v1[\s\S]*p_order_id:\s*orderNumericId/
    );
  }
);

test(
  "legacy Node game-play balance mutation is removed",
  () => {
    assert.doesNotMatch(
      processor,
      /awardGamePlaysForPaidOrder/
    );

    assert.doesNotMatch(
      processor,
      /\.select\("game_plays,\s*plays_from_spend"\)/
    );

    assert.doesNotMatch(
      processor,
      /plays_from_spend:\s*Number\(player\?\.plays_from_spend/
    );
  }
);

test(
  "new-order path invokes durable game-play effect",
  () => {
    const calls =
      processor.match(
        /await runGamePlaysEffectBestEffort\(\s*order\s*\)/g
      ) || [];

    /*
     * One call belongs to replay helper and one to the new-order path.
     */
    assert.equal(
      calls.length,
      2
    );
  }
);

test(
  "all three durable replay exits recover post-order effects",
  () => {
    const replayCalls =
      processor.match(
        /return buildReplayCompletionWithEffects\(\{/g
      ) || [];

    assert.equal(
      replayCalls.length,
      3
    );

    assert.match(
      processor,
      /async function buildReplayCompletionWithEffects[\s\S]*await runGamePlaysEffectBestEffort\(\s*order\s*\)[\s\S]*return buildCompletionResult\(\{[\s\S]*replayed:\s*true/
    );
  }
);

test(
  "no direct replay completion bypass remains",
  () => {
    const directReplay =
      /return buildCompletionResult\(\{[\s\S]{0,180}replayed:\s*true/g;

    const matches =
      processor.match(
        directReplay
      ) || [];

    /*
     * Exactly one is allowed: inside
     * buildReplayCompletionWithEffects itself.
     */
    assert.equal(
      matches.length,
      1
    );
  }
);

test(
  "effect execution requires explicit acquired lease ownership",
  () => {
    const ownership =
      executor.indexOf(
        "claim.acquired !== true"
      );

    const execution =
      executor.indexOf(
        "await execute("
      );

    assert.ok(
      ownership >= 0
    );

    assert.ok(
      execution > ownership
    );
  }
);

test(
  "game-play effect failure remains recoverable without undoing commerce completion",
  () => {
    assert.match(
      processor,
      /async function runGamePlaysEffectBestEffort[\s\S]*catch \(error\)[\s\S]*failed:\s*true/
    );
  }
);
