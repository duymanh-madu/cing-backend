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


test(
  "Counter exposes one bounded manual payment endpoint",
  () => {
    assert.match(
      route,
      /router\.post\(\s*"\/manual-payment"/
    );

    assert.match(
      route,
      /prepareManualPosPaymentQr/
    );
  }
);


test(
  "manual endpoint accepts only amount and request_id",
  () => {
    assert.match(
      route,
      /new Set\(\[\s*"amount",\s*"request_id",\s*\]\)/
    );

    assert.doesNotMatch(
      route,
      /allowedKeys[\s\S]{0,200}"pos_parent"/
    );

    assert.doesNotMatch(
      route,
      /allowedKeys[\s\S]{0,200}"pos_id"/
    );
  }
);


test(
  "cashier actor comes from authenticated admin context",
  () => {
    assert.match(
      route,
      /resolveActorId\(\s*req\s*\)/
    );

    assert.match(
      route,
      /prepareManualPosPaymentQr\(\{[\s\S]*actorId/
    );

    assert.doesNotMatch(
      route,
      /body\.actor/
    );
  }
);


test(
  "POS identity is resolved only from authenticated actor store",
  () => {
    const resolverStart =
      service.indexOf(
        "async function resolveCounterStore"
      );

    const resolverEnd =
      service.indexOf(
        "\nconst SESSION_STATUSES",
        resolverStart
      );

    assert.ok(
      resolverStart >= 0 &&
      resolverEnd > resolverStart
    );

    const resolver =
      service.slice(
        resolverStart,
        resolverEnd
      );

    assert.match(
      resolver,
      /cing_wallet_resolve_counter_store_v1/
    );

    assert.match(
      resolver,
      /p_actor_admin_id/
    );

    assert.doesNotMatch(
      resolver,
      /CING_WALLET_POS_PARENT/
    );

    assert.doesNotMatch(
      resolver,
      /CING_WALLET_POS_ID/
    );

    const prepareStart =
      service.indexOf(
        "async function prepareManualPosPaymentQr"
      );

    const prepareEnd =
      service.indexOf(
        "\nasync function freezeAmountAndCreateQr",
        prepareStart
      );

    const prepare =
      service.slice(
        prepareStart,
        prepareEnd
      );

    const rpcStart =
      prepare.indexOf(
        "await supabase.rpc("
      );

    const rpcEnd =
      prepare.indexOf(
        "throwRpcError(",
        rpcStart
      );

    assert.ok(
      rpcStart >= 0 &&
      rpcEnd > rpcStart
    );

    const rpcBlock =
      prepare.slice(
        rpcStart,
        rpcEnd
      );

    assert.doesNotMatch(
      rpcBlock,
      /p_pos_parent\s*:/
    );

    assert.doesNotMatch(
      rpcBlock,
      /p_pos_id\s*:/
    );

    assert.match(
      rpcBlock,
      /p_actor_admin_id\s*:\s*normalizedActorId/
    );

    assert.match(
      prepare,
      /pos_parent:\s*[\s\S]*prepared\.pos_parent/
    );

    assert.match(
      prepare,
      /pos_id:\s*[\s\S]*prepared\.pos_id/
    );
  }
);


test(
  "missing or invalid actor store fails closed",
  () => {
    assert.match(
      service,
      /CING_WALLET_POS_COUNTER_STORE_NOT_CONFIGURED/
    );

    assert.match(
      service,
      /CING_WALLET_POS_COUNTER_STORE_INVALID/
    );

    assert.match(
      service,
      /statusCode:\s*503/
    );
  }
);


test(
  "manual HTTP path never accepts sale_tran_id or bill identity",
  () => {
    const start =
      route.indexOf(
        'router.post(\n  "/manual-payment"'
      );

    const end =
      route.indexOf(
        'router.get(\n  "/reconciliation-alerts"',
        start
      );

    assert.ok(
      start >= 0 &&
      end > start
    );

    const body =
      route.slice(
        start,
        end
      );

    for (
      const forbidden of [
        "sale_tran_id",
        "bill_reference",
        "pos_parent",
        "pos_id",
      ]
    ) {
      assert.equal(
        body.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);


test(
  "manual endpoint remains behind wallet.pos.operate permission and Counter gate",
  () => {
    const permission =
      route.indexOf(
        'requirePanelPermission(\n    "wallet.pos.operate"'
      );

    const counter =
      route.indexOf(
        "requireCounterEnabled"
      );

    const endpoint =
      route.indexOf(
        '"/manual-payment"'
      );

    assert.ok(
      permission >= 0
    );

    assert.ok(
      counter >= 0
    );

    assert.ok(
      endpoint > permission
    );

    assert.ok(
      endpoint > counter
    );
  }
);


test(
  "manual service still requires Epayment before DB authority",
  () => {
    const start =
      service.indexOf(
        "async function prepareManualPosPaymentQr"
      );

    const end =
      service.indexOf(
        "\nasync function freezeAmountAndCreateQr",
        start
      );

    const body =
      service.slice(
        start,
        end
      );

    const gate =
      body.indexOf(
        "assertPosEpaymentEnabled()"
      );

    const rpc =
      body.indexOf(
        ".rpc("
      );

    assert.ok(
      gate >= 0
    );

    assert.ok(
      rpc > gate
    );
  }
);


test(
  "manual HTTP path is independent of iPOS Foodbook Event 2 and Event 11",
  () => {
    const start =
      route.indexOf(
        'router.post(\n  "/manual-payment"'
      );

    const end =
      route.indexOf(
        'router.get(\n  "/reconciliation-alerts"',
        start
      );

    const body =
      route.slice(
        start,
        end
      );

    for (
      const forbidden of [
        "using_voucher",
        "Event 2",
        "Event 11",
        "Foodbook",
        "reconcileIposEvent11",
      ]
    ) {
      assert.equal(
        body.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);
