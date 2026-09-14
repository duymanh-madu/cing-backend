const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(
  __dirname,
  "../../.."
);

const service =
  fs.readFileSync(
    path.join(
      ROOT,
      "services/wallet/cingWalletPosPaymentService.js"
    ),
    "utf8"
  );

const dbMigration =
  fs.readFileSync(
    path.join(
      ROOT,
      "db/migrations/20260914_cing_wallet_pos_customer_preview_store_v2.sql"
    ),
    "utf8"
  );

const sbMigration =
  fs.readFileSync(
    path.join(
      ROOT,
      "supabase/migrations/20260914210000_cing_wallet_pos_customer_preview_store_v2.sql"
    ),
    "utf8"
  );

test(
  "preview V2 migration mirrors remain exact",
  () => {
    assert.equal(
      dbMigration,
      sbMigration
    );
  }
);

test(
  "preview V2 projects immutable merchant snapshot",
  () => {
    assert.match(
      sbMigration,
      /cing_wallet_get_pos_payment_for_customer_v2/
    );

    assert.match(
      sbMigration,
      /v_intent\.metadata->>'store_id'/
    );

    assert.match(
      sbMigration,
      /v_intent\.metadata->>'store_code'/
    );

    assert.match(
      sbMigration,
      /v_intent\.metadata->>'store_display_name'/
    );

    assert.match(
      sbMigration,
      /CING_WALLET_POS_STORE_SNAPSHOT_REQUIRED/
    );
  }
);

test(
  "preview V2 preserves V1 financial read semantics",
  () => {
    assert.match(
      sbMigration,
      /from\s+public\.players/
    );

    assert.match(
      sbMigration,
      /from\s+public\.cing_wallet_accounts/
    );

    assert.match(
      sbMigration,
      /v_intent\.amount/
    );

    assert.match(
      sbMigration,
      /v_balance/
    );

    assert.doesNotMatch(
      sbMigration,
      /cing_wallet_settle_pos_payment_atomic_v1/
    );
  }
);

test(
  "preview V2 remains service-role only",
  () => {
    assert.match(
      sbMigration,
      /security\s+definer/i
    );

    assert.match(
      sbMigration,
      /from\s+public,\s*anon,\s*authenticated/i
    );

    assert.match(
      sbMigration,
      /to\s+service_role/i
    );
  }
);

test(
  "backend preview uses V2 and returns merchant identity",
  () => {
    assert.match(
      service,
      /cing_wallet_get_pos_payment_for_customer_v2/
    );

    assert.match(
      service,
      /store_id:\s*[\s\S]*row\.store_id/
    );

    assert.match(
      service,
      /store_code:\s*[\s\S]*row\.store_code/
    );

    assert.match(
      service,
      /store_display_name:\s*[\s\S]*row\.store_display_name/
    );
  }
);

test(
  "normalizer preserves authoritative merchant fields",
  () => {
    const start =
      service.indexOf(
        "function normalizeIntentRow"
      );

    const end =
      service.indexOf(
        "async function createIposPosPayment",
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const body =
      service.slice(
        start,
        end
      );

    assert.match(
      body,
      /store_id:[\s\S]*row\.store_id/
    );

    assert.match(
      body,
      /store_code:[\s\S]*row\.store_code/
    );

    assert.match(
      body,
      /store_display_name:[\s\S]*row\.store_display_name/
    );
  }
);

test(
  "merchant identity is not accepted from customer request",
  () => {
    const start =
      service.indexOf(
        "async function previewCustomerPosPayment"
      );

    const end =
      service.indexOf(
        "async function confirmCustomerPosPayment",
        start
      );

    const body =
      service.slice(
        start,
        end
      );

    assert.doesNotMatch(
      body,
      /customer.*store_id|customer.*store_code|customer.*store_display_name/i
    );
  }
);
