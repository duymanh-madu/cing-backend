const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const source =
  fs.readFileSync(
    "services/payment/commerceOrderEffectExecutor.js",
    "utf8"
  );

test(
  "executor uses durable ensure then claim authority",
  () => {
    const ensure =
      source.indexOf(
        "cing_commerce_ensure_order_effect_v1"
      );

    const claim =
      source.indexOf(
        "cing_commerce_claim_order_effect_v1"
      );

    assert.ok(ensure >= 0);
    assert.ok(claim > ensure);
  }
);

test(
  "business execution requires explicit acquired true",
  () => {
    const ownership =
      source.indexOf(
        "claim.acquired !== true"
      );

    const execute =
      source.indexOf(
        "await execute("
      );

    assert.ok(ownership >= 0);
    assert.ok(execute > ownership);
  }
);

test(
  "claim token presence alone is never treated as lease ownership",
  () => {
    assert.match(
      source,
      /claim\.acquired !== true/
    );

    assert.doesNotMatch(
      source,
      /claim\.status !== "processing"\s*\|\|\s*!claim\.claim_token[\s\S]*reason:\s*"not_claimed"/
    );
  }
);

test(
  "acquired claim must have processing status and token",
  () => {
    assert.match(
      source,
      /claim\.acquired !== true[\s\S]*claim\.status !== "processing"[\s\S]*!claim\.claim_token[\s\S]*COMMERCE_ORDER_EFFECT_CLAIM_CONTRACT_INVALID/
    );
  }
);

test(
  "completed effect never executes business callback again",
  () => {
    const completed =
      source.indexOf(
        'claim.status === "completed"'
      );

    const execute =
      source.indexOf(
        "await execute("
      );

    assert.ok(completed >= 0);
    assert.ok(execute > completed);
  }
);

test(
  "successful execution is durably completed",
  () => {
    assert.match(
      source,
      /await execute\([\s\S]*cing_commerce_complete_order_effect_v1/
    );
  }
);

test(
  "failed execution releases durable lease through fail authority",
  () => {
    assert.match(
      source,
      /catch \(error\)[\s\S]*cing_commerce_fail_order_effect_v1/
    );
  }
);

test(
  "executor preserves original business error if fail authority also faults",
  () => {
    assert.match(
      source,
      /error\.effectAuthorityFailure[\s\S]*failError/
    );
  }
);

test(
  "executor does not directly mutate order effect table",
  () => {
    assert.doesNotMatch(
      source,
      /\.from\(\s*["']cing_commerce_order_effects["']\s*\)/
    );
  }
);
