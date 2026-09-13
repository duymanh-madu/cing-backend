"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");


const ROOT =
  path.resolve(
    __dirname,
    "../../.."
  );

function read(
  relativePath
) {
  return fs
    .readFileSync(
      path.join(
        ROOT,
        relativePath
      ),
      "utf8"
    );
}


const webhook =
  read(
    "routes/iposWebhookRoutes.js"
  );

const counterRoute =
  read(
    "routes/adminWalletPosRoutes.js"
  );

const service =
  read(
    "services/wallet/cingWalletPosSessionService.js"
  );

const routeIndex =
  read(
    "routes/index.js"
  );


test(
  "Event 2 Wallet trigger is handled synchronously before generic webhook ACK",
  () => {
    const lane =
      webhook.indexOf(
        "CING WALLET POS EVENT 2 SYNCHRONOUS LANE"
      );

    const genericAck =
      webhook.indexOf(
        "Trả về 200 ngay — không để iPos timeout"
      );

    assert.ok(
      lane >= 0
    );

    assert.ok(
      genericAck >
      lane
    );

    assert.match(
      webhook,
      /isCingWalletPosTriggerRequest[\s\S]*await handleIposUsingVoucher[\s\S]*return res\.json/
    );
  }
);


test(
  "only exact configured trigger code can enter Wallet Event 2 lane",
  () => {
    assert.match(
      service,
      /CING_WALLET_POS_TRIGGER_CODE/
    );

    assert.match(
      service,
      /requestCode\s*===\s*configuredCode/
    );
  }
);


test(
  "Wallet trigger voucher never discounts the POS bill and permits other promotions",
  () => {
    assert.match(
      service,
      /Discount_Amount:\s*0/
    );

    assert.match(
      service,
      /Only_Coupon:\s*0/
    );

    assert.match(
      service,
      /Code:\s*4/
    );
  }
);


test(
  "Event 2 discovers bill identity and never derives payment amount from line items",
  () => {
    assert.match(
      service,
      /p_pos_parent:\s*normalized\.posParent/
    );

    assert.match(
      service,
      /p_pos_id:\s*normalized\.posId/
    );

    assert.match(
      service,
      /p_sale_tran_id:\s*normalized\.saleTranId/
    );

    assert.doesNotMatch(
      service,
      /reduce\s*\([\s\S]{0,300}Voucher_Order_Line/
    );

    assert.doesNotMatch(
      service,
      /Voucher_Order_Line[\s\S]{0,300}normalizeAmount/
    );
  }
);


test(
  "Counter production surface is fail closed by explicit runtime flag",
  () => {
    assert.match(
      service,
      /CING_WALLET_POS_COUNTER_ENABLED/
    );

    assert.match(
      service,
      /toLowerCase\(\)\s*===\s*"true"/
    );

    assert.doesNotMatch(
      service,
      /CING_WALLET_POS_COUNTER_ENABLED\s*\|\|\s*["']true["']/
    );
  }
);


test(
  "Counter API requires dedicated wallet POS operate permission",
  () => {
    assert.match(
      counterRoute,
      /requirePanelPermission\(\s*"wallet\.pos\.operate"\s*\)/
    );

    assert.match(
      counterRoute,
      /requireCounterEnabled/
    );
  }
);


test(
  "Counter amount comes only from authenticated admin body and actor context",
  () => {
    assert.match(
      counterRoute,
      /body\.amount/
    );

    assert.match(
      counterRoute,
      /req\?\.admin\?\.id/
    );

    assert.doesNotMatch(
      counterRoute,
      /x-user-id|x-zalo-user-id|x-cashier/i
    );
  }
);


test(
  "cashier amount freezes before canonical payment intent creation",
  () => {
    const freeze =
      service.indexOf(
        "cing_wallet_freeze_pos_session_amount_v1"
      );

    const create =
      service.indexOf(
        "await createIposPosPayment"
      );

    const link =
      service.indexOf(
        "cing_wallet_link_pos_session_payment_intent_v1"
      );

    assert.ok(
      freeze >= 0
    );

    assert.ok(
      create >
      freeze
    );

    assert.ok(
      link >
      create
    );
  }
);


test(
  "cashier manual source is explicit and existing POS payment authority creates QR",
  () => {
    assert.match(
      service,
      /p_amount_source:\s*"cashier_manual"/
    );

    assert.match(
      service,
      /createIposPosPayment\(\{[\s\S]*transactionId:\s*session\.sale_tran_id[\s\S]*amount:\s*normalizedAmount/
    );

    assert.match(
      service,
      /qr_content:\s*payment\.qr_content/
    );
  }
);


test(
  "V1B never mutates Wallet balance or ledger directly",
  () => {
    const combined =
      service +
      "\n" +
      counterRoute +
      "\n" +
      webhook;

    assert.doesNotMatch(
      combined,
      /cing_wallet_apply_mutation_private\s*\(/
    );

    assert.doesNotMatch(
      combined,
      /\.from\(\s*["']cing_wallet_accounts["']\s*\)[\s\S]{0,250}\.update\(/
    );

    assert.doesNotMatch(
      combined,
      /\.from\(\s*["']cing_wallet_transactions["']\s*\)[\s\S]{0,250}\.insert\(/
    );
  }
);


test(
  "Counter route is mounted before canonical wallet admin router",
  () => {
    const specific =
      routeIndex.indexOf(
        '"/admin/wallet/pos"'
      );

    const general =
      routeIndex.indexOf(
        '"/admin/wallet"'
      );

    assert.ok(
      specific >= 0
    );

    assert.ok(
      general >
      specific
    );

    assert.match(
      routeIndex,
      /require\(["']\.\/adminWalletPosRoutes["']\)/
    );
  }
);


test(
  "Event 2 and QR readiness publish realtime transitions",
  () => {
    assert.match(
      service,
      /wallet\.pos\.session\.discovered/
    );

    assert.match(
      service,
      /wallet\.pos\.qr\.ready/
    );

    assert.match(
      service,
      /realtimeEventBus\.publish/
    );
  }
);
