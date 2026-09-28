"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root =
  path.resolve(__dirname, "../../../..");

const source =
  fs.readFileSync(
    path.join(
      root,
      "services/game/orderSpendPlayAwardService.js"
    ),
    "utf8"
  );

test(
  "CRM award resolves canonical durable order first",
  () => {
    const resolver =
      source.indexOf(
        "async function resolveCanonicalCrmOrder("
      );

    const award =
      source.indexOf(
        "async function awardGamePlaysForOrderSpend("
      );

    assert.ok(resolver >= 0);
    assert.ok(award > resolver);

    assert.match(
      source,
      /\.from\("crm_orders"\)/
    );

    assert.match(
      source,
      /crm_order_owner_mismatch/
    );

    assert.match(
      source,
      /crm_order_amount_mismatch/
    );
  }
);

test(
  "CRM runtime uses Bridge V2 atomic award",
  () => {
    assert.match(
      source,
      /cing_bridge_crm_award_revive_v1/
    );

    assert.doesNotMatch(
      source,
      /cing_crm_order_spend_plays_atomic_v1/
    );

    assert.doesNotMatch(
      source,
      /\baddPlays\s*\(/
    );
  }
);

test(
  "CRM V2 handles awarded and replayed separately",
  () => {
    assert.match(
      source,
      /status !== "awarded"/
    );

    assert.match(
      source,
      /status === "replayed"/
    );

    assert.match(
      source,
      /replayed:\s*status === "replayed"/
    );

    assert.match(
      source,
      /success:\s*true,[\s\S]*?skipped:\s*false/
    );
  }
);

test(
  "CRM V2 deferred outcome is never success",
  () => {
    const start =
      source.indexOf(
        'if (status === "deferred")'
      );

    const end =
      source.indexOf(
        'if (status === "review_required")',
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const branch =
      source.slice(start, end);

    assert.match(
      branch,
      /success:\s*false/
    );

    assert.match(
      branch,
      /deferred:\s*true/
    );
  }
);

test(
  "CRM V2 review outcome is never success",
  () => {
    const start =
      source.indexOf(
        'if (status === "review_required")'
      );

    const end =
      source.indexOf(
        'if (\n    status === "skipped"',
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const branch =
      source.slice(start, end);

    assert.match(
      branch,
      /success:\s*false/
    );

    assert.match(
      branch,
      /review:\s*true/
    );
  }
);

test(
  "CRM recovery is Bridge-owned and bounded",
  () => {
    assert.match(
      source,
      /cing_bridge_crm_revive_recover_batch_v1/
    );

    assert.match(
      source,
      /Math\.min\(\s*100/
    );

    assert.doesNotMatch(
      source,
      /\.from\("analytics_events"\)/
    );
  }
);
