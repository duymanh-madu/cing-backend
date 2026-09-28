"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root =
  path.resolve(__dirname, "../../../..");

function read(name) {
  return fs.readFileSync(
    path.join(root, name),
    "utf8"
  );
}

const guard = read(
  "services/games/revival/cingLegacyGamePlaysCutoverGuard.js"
);

const crm = read(
  "services/game/orderSpendPlayAwardService.js"
);

const ipos = read(
  "routes/iposWebhookRoutes.js"
);

const commerce = read(
  "services/payment/paidOrderSettlementProcessor.js"
);

test(
  "legacy mutation guard remains default OFF",
  () => {
    assert.match(
      guard,
      /process\.env\[FLAG\] === "true"/
    );
  }
);

test(
  "CRM order award has crossed to Bridge V2",
  () => {
    assert.match(
      crm,
      /cing_bridge_crm_award_revive_v1/
    );

    assert.doesNotMatch(
      crm,
      /cing_crm_order_spend_plays_atomic_v1/
    );

    assert.doesNotMatch(
      crm,
      /isLegacyGamePlaysMutationDisabled/
    );

    assert.doesNotMatch(
      crm,
      /\.from\("players"\)/
    );

    assert.doesNotMatch(
      crm,
      /\.from\("analytics_events"\)/
    );
  }
);

test(
  "iPOS delegates into canonical CRM Bridge service",
  () => {
    const start =
      ipos.indexOf(
        "async function awardOrderGamePlays("
      );

    const end =
      ipos.indexOf(
        "function extractIposOrderAmount(",
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const block =
      ipos.slice(start, end);

    assert.match(
      block,
      /awardGamePlaysForOrderSpend/
    );

    assert.match(
      block,
      /source_context:\s*"ipos_webhook"/
    );

    assert.doesNotMatch(
      block,
      /isLegacyGamePlaysMutationDisabled/
    );

    assert.doesNotMatch(
      block,
      /\.from\("players"\)/
    );

    assert.doesNotMatch(
      block,
      /\.from\("analytics_events"\)/
    );
  }
);

test(
  "Commerce uses distinct Revive Credit effect identity",
  () => {
    assert.match(
      commerce,
      /async function runReviveCreditEffect\(/
    );

    assert.match(
      commerce,
      /effectKey:\s*"revive_credit"/
    );

    assert.match(
      commerce,
      /cing_commerce_verify_ipos_source_identity_v1/
    );

    assert.match(
      commerce,
      /cing_bridge_commerce_award_revive_v1/
    );

    assert.doesNotMatch(
      commerce,
      /cing_commerce_award_order_spend_plays_v1/
    );
  }
);

test(
  "Commerce Bridge completes only terminal outcomes",
  () => {
    assert.match(
      commerce,
      /status === "awarded"/
    );

    assert.match(
      commerce,
      /status === "replayed"/
    );

    assert.match(
      commerce,
      /status === "skipped"/
    );

    assert.match(
      commerce,
      /COMMERCE_REVIVE_NOT_TERMINAL/
    );
  }
);

test(
  "Commerce payment loyalty effects remain present",
  () => {
    assert.match(
      commerce,
      /await runPointsDeductEffectBestEffort\(/
    );

    assert.match(
      commerce,
      /await runPointsEarnEffectBestEffort\(/
    );
  }
);
