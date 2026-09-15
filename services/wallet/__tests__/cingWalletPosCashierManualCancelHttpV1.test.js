const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");

const service = fs.readFileSync(
  path.join(
    root,
    "services/wallet/cingWalletPosSessionService.js"
  ),
  "utf8"
);

const route = fs.readFileSync(
  path.join(
    root,
    "routes/adminWalletPosRoutes.js"
  ),
  "utf8"
);

function cancelServiceBlock() {
  const start = service.indexOf(
    "async function cancelManualPosSession("
  );

  assert.notEqual(start, -1);

  const end = service.indexOf(
    "\nmodule.exports",
    start
  );

  assert.notEqual(end, -1);

  return service.slice(start, end);
}

function cancelRouteBlock() {
  const start = route.indexOf(
    '"/manual-session/:sessionId/cancel"'
  );

  assert.notEqual(start, -1);

  const tail = route.slice(start);
  const end = tail.indexOf("\n);");

  assert.notEqual(end, -1);

  return tail.slice(0, end);
}

test(
  "cancel delegates once to PostgreSQL authority",
  () => {
    const block = cancelServiceBlock();

    const calls =
      block.match(
        /cing_wallet_cancel_manual_pos_session_v1/g
      ) || [];

    assert.equal(calls.length, 1);

    assert.match(block, /p_actor_admin_id/);
    assert.match(block, /p_session_id/);
    assert.match(block, /p_cancel_request_id/);
    assert.match(block, /p_reason/);
  }
);

test(
  "cancel is Counter gated but EPAYMENT independent",
  () => {
    const block = cancelServiceBlock();

    assert.match(
      block,
      /assertPosCounterEnabled\(\)/
    );

    assert.doesNotMatch(
      block,
      /assertPosEpaymentEnabled/
    );
  }
);

test(
  "HTTP actor comes from authenticated admin",
  () => {
    const block = cancelRouteBlock();

    assert.match(
      block,
      /resolveActorId\(req\)/
    );

    assert.match(
      block,
      /req\.params\?\.sessionId/
    );
  }
);

test(
  "HTTP body is command-only",
  () => {
    const block = cancelRouteBlock();

    assert.match(block, /"request_id"/);
    assert.match(block, /"reason"/);

    assert.doesNotMatch(block, /store_id/);
    assert.doesNotMatch(block, /pos_parent/);
    assert.doesNotMatch(block, /pos_id/);
  }
);

test(
  "cancel service has no financial/economy authority",
  () => {
    const block = cancelServiceBlock();

    const forbidden = [
      "cing_wallet_settle_pos_payment_atomic_v1",
      "cing_wallet_apply_mutation_private",
      "updateMemberPoint",
      "addPoints",
      "syncSingleUserSpending",
      "pending_rewards",
      "commerce_point",
      "Event11",
      "event11"
    ];

    for (const symbol of forbidden) {
      assert.equal(
        block.includes(symbol),
        false,
        `forbidden authority: ${symbol}`
      );
    }
  }
);

test(
  "cancel response requires terminal cancelled state",
  () => {
    const block = cancelServiceBlock();

    assert.match(
      block,
      /row\.session_status !== "cancelled"/
    );

    assert.match(
      block,
      /row\.payment_status !== "cancelled"/
    );
  }
);
