"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const test =
  require("node:test");


const service =
  fs.readFileSync(
    "services/wallet/cingWalletPosSessionService.js",
    "utf8"
  );

const route =
  fs.readFileSync(
    "routes/adminWalletPosRoutes.js",
    "utf8"
  );

const sql =
  fs.readFileSync(
    "db/migrations/20260914_cing_wallet_pos_store_registry_v1.sql",
    "utf8"
  );


function serviceBody() {
  const start =
    service.indexOf(
      "async function getCurrentManualPosSession"
    );

  const end =
    service.indexOf(
      "\nasync function prepareManualPosPaymentQr",
      start
    );

  assert.ok(
    start >= 0 &&
    end > start
  );

  return service.slice(
    start,
    end
  );
}


function rpcBody() {
  const start =
    sql.indexOf(
      "public.cing_wallet_get_current_manual_pos_session_v1("
    );

  assert.ok(
    start >= 0
  );

  const end =
    sql.indexOf(
      "\n$$;",
      start
    );

  assert.ok(
    end > start
  );

  return sql.slice(
    start,
    end + 4
  );
}


test(
  "Counter exposes authoritative current manual session endpoint",
  () => {
    assert.match(
      route,
      /router\.get\(\s*"\/manual-session"/
    );

    assert.match(
      route,
      /getCurrentManualPosSession/
    );
  }
);


test(
  "current session identity comes only from authenticated actor",
  () => {
    const body =
      serviceBody();

    assert.match(
      body,
      /p_actor_admin_id/
    );

    assert.match(
      body,
      /actorId/
    );

    assert.doesNotMatch(
      body,
      /req\.|body\.|query\./
    );

    assert.doesNotMatch(
      body,
      /CING_WALLET_POS_PARENT|CING_WALLET_POS_ID/
    );
  }
);


test(
  "current session uses one actor-bound PostgreSQL RPC",
  () => {
    const body =
      serviceBody();

    assert.match(
      body,
      /cing_wallet_get_current_manual_pos_session_v1/
    );

    assert.equal(
      (
        body.match(
          /\.rpc\s*\(/g
        ) || []
      ).length,
      1
    );

    assert.doesNotMatch(
      body,
      /resolveCounterStore\(/
    );

    assert.doesNotMatch(
      body,
      /\.from\s*\(/
    );
  }
);


test(
  "current session read excludes Event 2 discovery sessions",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /session_origin in[\s\S]*'cashier_manual'[\s\S]*'ipos_api'/
    );

    assert.doesNotMatch(
      body,
      /'event2'/
    );
  }
);


test(
  "current read returns only pre-reconciliation occupied-slot states",
  () => {
    const body =
      rpcBody();

    for (
      const status of [
        "amount_frozen",
        "qr_ready",
        "paid",
        "reconciliation_pending",
      ]
    ) {
      assert.ok(
        body.includes(
          `'${status}'`
        ),
        status
      );
    }

    assert.doesNotMatch(
      body,
      /'reconciled'/
    );

    assert.doesNotMatch(
      body,
      /'reconciliation_mismatch'/
    );
  }
);


test(
  "current manual session read is bounded to one row",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /order by[\s\S]*ps\.created_at desc/
    );

    assert.match(
      body,
      /limit 1/
    );
  }
);


test(
  "current session endpoint remains behind permission and Counter gate",
  () => {
    const permission =
      route.indexOf(
        'requirePanelPermission(\n    "wallet.pos.operate"'
      );

    const counterGate =
      route.indexOf(
        "router.use(\n  requireCounterEnabled"
      );

    const endpoint =
      route.indexOf(
        '"/manual-session"'
      );

    assert.ok(
      permission >= 0
    );

    assert.ok(
      counterGate >= 0
    );

    assert.ok(
      endpoint > permission
    );

    assert.ok(
      endpoint > counterGate
    );
  }
);


test(
  "current-session RPC is strictly read only",
  () => {
    const body =
      rpcBody();

    for (
      const forbidden of [
        /\binsert\b/i,
        /\bupdate\b/i,
        /\bdelete\b/i,
        /wallet_debit/i,
        /wallet_credit/i,
        /refund/i,
        /settle_pos_payment/i,
        /apply_mutation/i,
      ]
    ) {
      assert.doesNotMatch(
        body,
        forbidden
      );
    }
  }
);


test(
  "current-session RPC reuses canonical actor store resolver",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /cing_wallet_resolve_counter_store_v1/
    );

    assert.match(
      body,
      /p_actor_admin_id/
    );

    assert.doesNotMatch(
      body,
      /p_store_id|p_pos_parent|p_pos_id/
    );
  }
);


test(
  "current-session RPC is backend service-role only",
  () => {
    assert.match(
      sql,
      /revoke all on function[\s\S]*cing_wallet_get_current_manual_pos_session_v1[\s\S]*from public, anon, authenticated/
    );

    assert.match(
      sql,
      /grant execute on function[\s\S]*cing_wallet_get_current_manual_pos_session_v1[\s\S]*to service_role/
    );
  }
);
