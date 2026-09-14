"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const crypto =
  require("node:crypto");

const test =
  require("node:test");


const SERVICE =
  "services/wallet/cingWalletPosSessionService.js";

const DB =
  "db/migrations/20260914_cing_wallet_pos_store_registry_v1.sql";

const SB =
  "supabase/migrations/20260914041000_cing_wallet_pos_store_registry_v1.sql";


const service =
  fs.readFileSync(
    SERVICE,
    "utf8"
  );

const sql =
  fs.readFileSync(
    DB,
    "utf8"
  );


function currentBody() {
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


function hash(path) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      fs.readFileSync(
        path
      )
    )
    .digest(
      "hex"
    );
}


test(
  "store registry migration mirrors remain byte identical",
  () => {
    assert.equal(
      hash(DB),
      hash(SB)
    );
  }
);


test(
  "each current-session poll performs exactly one Supabase call",
  () => {
    const body =
      currentBody();

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

    assert.equal(
      (
        body.match(
          /resolveCounterStore\(/g
        ) || []
      ).length,
      0
    );
  }
);


test(
  "single RPC resolves canonical actor store inside PostgreSQL",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /cing_wallet_resolve_counter_store_v1/
    );

    assert.match(
      body,
      /v_store\.pos_parent/
    );

    assert.match(
      body,
      /v_store\.pos_id/
    );
  }
);


test(
  "browser has no store or POS selector authority",
  () => {
    const body =
      rpcBody();

    assert.doesNotMatch(
      body,
      /p_store_id|p_pos_parent|p_pos_id/
    );

    assert.match(
      body,
      /p_actor_admin_id/
    );
  }
);


test(
  "single RPC preserves current-session filtering contract",
  () => {
    const body =
      rpcBody();

    assert.match(
      body,
      /'cashier_manual'/
    );

    assert.match(
      body,
      /'ipos_api'/
    );

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

    assert.match(
      body,
      /limit 1/
    );
  }
);


test(
  "single RPC has zero financial mutation authority",
  () => {
    const body =
      rpcBody();

    for (
      const forbidden of [
        /\binsert\b/i,
        /\bupdate\b/i,
        /\bdelete\b/i,
        /cing_wallet_accounts/i,
        /cing_wallet_transactions/i,
        /settle_pos_payment/i,
        /apply_mutation/i,
        /wallet_debit/i,
        /wallet_credit/i,
      ]
    ) {
      assert.doesNotMatch(
        body,
        forbidden
      );
    }
  }
);
