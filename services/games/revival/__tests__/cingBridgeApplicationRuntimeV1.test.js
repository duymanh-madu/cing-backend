"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root =
  path.resolve(__dirname, "../../../..");

function read(rel) {
  return fs.readFileSync(
    path.join(root, rel),
    "utf8"
  );
}

test(
  "Commerce runtime uses Bridge V2 Revive authority",
  () => {
    const src = read(
      "services/payment/paidOrderSettlementProcessor.js"
    );

    assert.match(
      src,
      /cing_commerce_verify_ipos_source_identity_v1/
    );

    assert.match(
      src,
      /cing_bridge_commerce_award_revive_v1/
    );

    assert.match(
      src,
      /effectKey:\s*"revive_credit"/
    );

    assert.doesNotMatch(
      src,
      /cing_commerce_award_order_spend_plays_v1/
    );

    assert.doesNotMatch(
      src,
      /legacy_game_plays_cutover_deferred/
    );
  }
);

test(
  "CRM runtime uses Bridge V2 award and recovery",
  () => {
    const src = read(
      "services/game/orderSpendPlayAwardService.js"
    );

    assert.match(
      src,
      /cing_bridge_crm_award_revive_v1/
    );

    assert.match(
      src,
      /cing_bridge_crm_revive_recover_batch_v1/
    );

    assert.doesNotMatch(
      src,
      /cing_crm_order_spend_plays_atomic_v1/
    );

    assert.doesNotMatch(
      src,
      /\.from\("crm_orders"\)[\s\S]*\.range\(from/
    );
  }
);

test(
  "CRM recovery worker uses Bridge V2 batch authority",
  () => {
    const src = read(
      "services/game/cingCrmOrderRewardRecoveryWorker.js"
    );

    assert.match(
      src,
      /cing_bridge_crm_revive_recover_batch_v1/
    );

    assert.doesNotMatch(
      src,
      /cing_crm_order_reward_recover_batch_v1/
    );

    assert.doesNotMatch(
      src,
      /legacy_cutover_admission_closed/
    );
  }
);

test(
  "iPOS runtime no longer blocks itself on legacy env guard",
  () => {
    const src = read(
      "routes/iposWebhookRoutes.js"
    );

    assert.doesNotMatch(
      src,
      /isLegacyGamePlaysMutationDisabled/
    );

    assert.match(
      src,
      /awardGamePlaysForOrderSpend/
    );
  }
);
