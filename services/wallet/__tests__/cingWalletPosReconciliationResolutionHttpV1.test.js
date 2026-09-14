"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const test =
  require("node:test");


const route =
  fs.readFileSync(
    "routes/adminWalletPosRoutes.js",
    "utf8"
  );

const service =
  fs.readFileSync(
    "services/wallet/cingWalletPosSessionService.js",
    "utf8"
  );


function routeBody() {
  const startMatch =
    route.match(
      /router\.post\s*\(\s*["']\/reconciliation-alerts\/:alertId\/resolve["']/
    );

  assert.ok(
    startMatch
  );

  const start =
    startMatch.index;

  const tail =
    route.slice(
      start
    );

  const nextGet =
    tail.match(
      /router\.get\s*\(\s*["']\/reconciliation-alerts["']/
    );

  assert.ok(
    nextGet
  );

  const end =
    start +
    nextGet.index;

  return route.slice(
    start,
    end
  );
}


function serviceBody() {
  const start =
    service.indexOf(
      "async function resolvePosReconciliation"
    );

  assert.ok(
    start >= 0
  );

  const end =
    service.indexOf(
      "\nasync function listPosReconciliationAlerts",
      start
    );

  assert.ok(
    end > start
  );

  return service.slice(
    start,
    end
  );
}


test(
  "resolution route exists exactly once",
  () => {
    const matches =
      route.match(
        /router\.post\s*\(\s*["']\/reconciliation-alerts\/:alertId\/resolve["']/g
      ) || [];

    assert.equal(
      matches.length,
      1
    );
  }
);


test(
  "resolution route requires explicit Super Admin",
  () => {
    const body =
      routeBody();

    assert.match(
      body,
      /req\.admin\?\.role[\s\S]*"super_admin"/
    );

    assert.match(
      body,
      /CING_WALLET_SUPER_ADMIN_REQUIRED/
    );

    assert.match(
      body,
      /\.status\(403\)/
    );
  }
);


test(
  "actor comes only from authenticated admin context",
  () => {
    const body =
      routeBody();

    assert.match(
      body,
      /resolveActorId\([\s\S]*req[\s\S]*\)/
    );

    assert.match(
      body,
      /resolvePosReconciliation\(\{[\s\S]*actorId/
    );

    assert.doesNotMatch(
      body,
      /body\.actor_id/
    );
  }
);


test(
  "client body is decision-only",
  () => {
    const body =
      routeBody();

    for (
      const required
      of [
        '"request_id"',
        '"resolution_action"',
        '"reason_code"',
        '"note"',
      ]
    ) {
      assert.equal(
        body.includes(
          required
        ),
        true,
        required
      );
    }

    for (
      const forbidden
      of [
        "actor_id",
        "user_id",
        "customer_user_id",
        "amount",
        "direction",
        "expected_amount",
        "actual_amount",
        "difference_amount",
        "wallet_transaction_id",
        "payment_intent_id",
        "pos_parent",
        "pos_id",
      ]
    ) {
      assert.equal(
        body.includes(
          `"${forbidden}"`
        ),
        false,
        forbidden
      );
    }
  }
);


test(
  "alert ID comes from URL and request ID from body",
  () => {
    const body =
      routeBody();

    assert.match(
      body,
      /req\.params[\s\S]*\.alertId/
    );

    assert.match(
      body,
      /body[\s\S]*\.request_id/
    );

    assert.match(
      body,
      /uuidPattern/
    );
  }
);


test(
  "resolution actions are exactly bounded",
  () => {
    const body =
      routeBody();

    for (
      const action
      of [
        "accept_as_is",
        "compensating_debit",
        "compensating_credit",
        "pos_correction_confirmed",
        "manual_review",
      ]
    ) {
      assert.match(
        body,
        new RegExp(
          action
        )
      );
    }
  }
);


test(
  "financial actions require note before service call",
  () => {
    const body =
      routeBody();

    const guard =
      body.indexOf(
        "CING_WALLET_POS_RESOLUTION_NOTE_REQUIRED"
      );

    const serviceCall =
      body.indexOf(
        "await resolvePosReconciliation"
      );

    assert.ok(
      guard >= 0
    );

    assert.ok(
      serviceCall > guard
    );
  }
);


test(
  "service performs exactly one specialized RPC",
  () => {
    const body =
      serviceBody();

    assert.equal(
      (
        body.match(
          /\.rpc\s*\(/g
        ) || []
      ).length,
      1
    );

    assert.equal(
      (
        body.match(
          /\.from\s*\(/g
        ) || []
      ).length,
      0
    );

    assert.match(
      body,
      /cing_wallet_resolve_pos_reconciliation_v1/
    );
  }
);


test(
  "generic admin adjustment authority is not reused",
  () => {
    const body =
      serviceBody();

    assert.doesNotMatch(
      body,
      /cing_wallet_admin_adjust_balance_atomic_v1/
    );

    assert.doesNotMatch(
      body,
      /adjustWalletBalance/
    );
  }
);


test(
  "service RPC passes no caller financial identity",
  () => {
    const body =
      serviceBody();

    const rpcStart =
      body.indexOf(
        "await supabase.rpc("
      );

    const rpcEnd =
      body.indexOf(
        "if (error)",
        rpcStart
      );

    assert.ok(
      rpcStart >= 0 &&
      rpcEnd > rpcStart
    );

    const rpc =
      body.slice(
        rpcStart,
        rpcEnd
      );

    for (
      const forbidden
      of [
        "p_user_id",
        "p_customer_user_id",
        "p_amount",
        "p_direction",
        "p_expected_amount",
        "p_actual_amount",
        "p_difference_amount",
        "p_wallet_transaction_id",
        "p_payment_intent_id",
        "p_pos_parent",
        "p_pos_id",
      ]
    ) {
      assert.doesNotMatch(
        rpc,
        new RegExp(
          forbidden
        )
      );
    }

    for (
      const required
      of [
        "p_alert_id",
        "p_request_id",
        "p_resolution_action",
        "p_reason_code",
        "p_note",
        "p_actor_id",
      ]
    ) {
      assert.match(
        rpc,
        new RegExp(
          required
        )
      );
    }
  }
);


test(
  "service maps not-found and conflict states",
  () => {
    const body =
      serviceBody();

    assert.match(
      body,
      /CING_WALLET_POS_RESOLUTION_ALERT_NOT_FOUND[\s\S]*statusCode:[\s\S]*404/
    );

    for (
      const code
      of [
        "CING_WALLET_POS_RESOLUTION_REPLAY_CONFLICT",
        "CING_WALLET_POS_RESOLUTION_ALERT_NOT_OPEN",
        "CING_WALLET_POS_RESOLUTION_EVIDENCE_CONFLICT",
        "CING_WALLET_POS_RESOLUTION_DIRECTION_CONFLICT",
        "CING_WALLET_POS_RESOLUTION_PAID_PROOF_REQUIRED",
        "CING_WALLET_INSUFFICIENT_BALANCE",
      ]
    ) {
      assert.match(
        body,
        new RegExp(
          code
        )
      );
    }

    assert.match(
      body,
      /conflictCode[\s\S]*statusCode:[\s\S]*409/
    );
  }
);


test(
  "service validates canonical RPC result",
  () => {
    const body =
      serviceBody();

    for (
      const token
      of [
        "row.resolution_id",
        "row.alert_id",
        "row.session_id",
        "row.alert_status",
        "row.applied",
        "CING_WALLET_POS_RESOLUTION_RESULT_INVALID",
      ]
    ) {
      assert.equal(
        body.includes(
          token
        ),
        true,
        token
      );
    }
  }
);
