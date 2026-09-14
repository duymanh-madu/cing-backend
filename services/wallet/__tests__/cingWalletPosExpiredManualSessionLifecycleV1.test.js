"use strict";

const assert =
  require("node:assert/strict");

const crypto =
  require("node:crypto");

const fs =
  require("node:fs");

const test =
  require("node:test");


const DB =
  "db/migrations/20260914_cing_wallet_pos_expired_manual_session_lifecycle_v1.sql";

const SB =
  "supabase/migrations/20260914223000_cing_wallet_pos_expired_manual_session_lifecycle_v1.sql";

const SERVICE =
  "services/wallet/cingWalletPosSessionService.js";


const db =
  fs.readFileSync(
    DB,
    "utf8"
  );

const sb =
  fs.readFileSync(
    SB,
    "utf8"
  );

const service =
  fs.readFileSync(
    SERVICE,
    "utf8"
  );


function hash(
  content
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      content
    )
    .digest(
      "hex"
    );
}


function functionBody(
  symbol
) {
  const start =
    db.indexOf(
      symbol
    );

  assert.ok(
    start >= 0,
    symbol
  );

  const end =
    db.indexOf(
      "\n$$;",
      start
    );

  assert.ok(
    end > start,
    symbol
  );

  return db.slice(
    start,
    end + 4
  );
}


test(
  "DB and Supabase lifecycle migrations are byte identical",
  () => {
    assert.equal(
      hash(db),
      hash(sb)
    );
  }
);


test(
  "private expiry authority uses the canonical per-POS transaction fence",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_expire_stale_manual_pos_session_private_v1("
      );

    assert.match(
      body,
      /pg_advisory_xact_lock[\s\S]*hashtextextended[\s\S]*v_pos_parent[\s\S]*v_pos_id/i
    );

    assert.match(
      body,
      /cing_wallet_pos_sessions[\s\S]*for update/i
    );

    assert.match(
      body,
      /cing_wallet_pos_payment_intents[\s\S]*for update/i
    );
  }
);


test(
  "expiry authority only targets manual or future iPOS API qr_ready sessions",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_expire_stale_manual_pos_session_private_v1("
      );

    assert.match(
      body,
      /session_origin in[\s\S]*'cashier_manual'[\s\S]*'ipos_api'/i
    );

    assert.match(
      body,
      /status\s*=\s*'qr_ready'/i
    );

    assert.doesNotMatch(
      body,
      /'event2'/i
    );
  }
);


test(
  "expiry authority verifies immutable session and intent identity",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_expire_stale_manual_pos_session_private_v1("
      );

    assert.match(
      body,
      /v_intent\.pos_parent[\s\S]*v_session\.pos_parent/i
    );

    assert.match(
      body,
      /v_intent\.pos_id[\s\S]*v_session\.pos_id/i
    );

    assert.match(
      body,
      /v_intent\.bill_reference[\s\S]*v_session\.sale_tran_id/i
    );

    assert.match(
      body,
      /v_intent\.amount[\s\S]*v_session\.amount/i
    );
  }
);


test(
  "financial or customer ownership evidence fails closed before expiry",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_expire_stale_manual_pos_session_private_v1("
      );

    assert.match(
      body,
      /v_intent\.status\s*=\s*'paid'/i
    );

    assert.match(
      body,
      /customer_user_id is not null/i
    );

    assert.match(
      body,
      /wallet_transaction_id is not null/i
    );

    assert.match(
      body,
      /paid_at is not null/i
    );

    assert.match(
      body,
      /CING_WALLET_POS_EXPIRE_FINANCIAL_PROOF_PRESENT/
    );
  }
);


test(
  "unexpired pending QR is preserved",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_expire_stale_manual_pos_session_private_v1("
      );

    assert.match(
      body,
      /v_intent\.status\s*=\s*'pending'[\s\S]*v_intent\.expires_at\s*>\s*v_now/i
    );

    assert.match(
      body,
      /false/i
    );
  }
);


test(
  "expired pending intent and qr_ready session terminalize together",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_expire_stale_manual_pos_session_private_v1("
      );

    assert.match(
      body,
      /update public\.cing_wallet_pos_payment_intents[\s\S]*status\s*=\s*'expired'/i
    );

    assert.match(
      body,
      /expires_at\s*<=\s*v_now/i
    );

    assert.match(
      body,
      /update public\.cing_wallet_pos_sessions[\s\S]*status\s*=\s*'expired'/i
    );

    assert.match(
      body,
      /payment_intent_id\s*=\s*v_intent\.id/i
    );
  }
);


test(
  "already-expired intent can synchronize a stale qr_ready session",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_expire_stale_manual_pos_session_private_v1("
      );

    assert.match(
      body,
      /v_intent\.status not in\s*\([\s\S]*'pending'[\s\S]*'expired'/i
    );

    assert.match(
      body,
      /if v_intent\.status\s*=\s*'pending' then/i
    );

    assert.match(
      body,
      /update public\.cing_wallet_pos_sessions/i
    );
  }
);


test(
  "expiry audit is append-only and replay-deduplicated",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_expire_stale_manual_pos_session_private_v1("
      );

    assert.match(
      body,
      /cing_wallet_pos_session_audit/i
    );

    assert.match(
      body,
      /'SESSION_EXPIRED'/i
    );

    assert.match(
      body,
      /'system'/i
    );

    assert.match(
      body,
      /'intent_expired:'[\s\S]*v_intent\.id::text/i
    );

    assert.match(
      body,
      /on conflict do nothing/i
    );
  }
);


test(
  "expiry authority has zero Wallet balance ledger or settlement mutation",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_expire_stale_manual_pos_session_private_v1("
      );

    for (
      const forbidden of [
        /cing_wallet_accounts/i,
        /cing_wallet_transactions/i,
        /settle_pos_payment/i,
        /apply_mutation/i,
        /wallet_debit/i,
        /wallet_credit/i,
        /balance\s*=/i,
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
  "current-session RPC normalizes lifecycle inside PostgreSQL before read projection",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_get_current_manual_pos_session_v1("
      );

    assert.match(
      body,
      /cing_wallet_resolve_counter_store_v1/i
    );

    assert.match(
      body,
      /cing_wallet_expire_stale_manual_pos_session_private_v1/i
    );

    assert.match(
      body,
      /v_store\.pos_parent/i
    );

    assert.match(
      body,
      /v_store\.pos_id/i
    );

    assert.match(
      body,
      /session_origin in[\s\S]*'cashier_manual'[\s\S]*'ipos_api'/i
    );

    assert.match(
      body,
      /limit 1/i
    );
  }
);


test(
  "Node current-session path remains exactly one Supabase RPC call",
  () => {
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

    const body =
      service.slice(
        start,
        end
      );

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
      /cing_wallet_get_current_manual_pos_session_v1/
    );
  }
);


test(
  "manual create normalizes stale session after acquiring the same POS fence",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_create_manual_pos_session_v2("
      );

    const lock =
      body.indexOf(
        "pg_advisory_xact_lock"
      );

    const normalize =
      body.indexOf(
        "cing_wallet_expire_stale_manual_pos_session_private_v1"
      );

    const busy =
      body.indexOf(
        "CING_WALLET_POS_MANUAL_POS_BUSY"
      );

    assert.ok(
      lock >= 0
    );

    assert.ok(
      normalize > lock
    );

    assert.ok(
      busy > normalize
    );
  }
);


test(
  "manual create preserves durable request id replay semantics",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_create_manual_pos_session_v2("
      );

    assert.match(
      body,
      /manual_request_id\s*=\s*p_request_id/i
    );

    assert.match(
      body,
      /CING_WALLET_POS_MANUAL_REPLAY_CONFLICT/i
    );

    assert.match(
      body,
      /v_existing\.status/i
    );

    assert.match(
      body,
      /false/i
    );
  }
);


test(
  "manual create still rejects legitimate occupied POS states",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_create_manual_pos_session_v2("
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
      /CING_WALLET_POS_MANUAL_POS_BUSY/
    );
  }
);


test(
  "manual create retains zero Wallet settlement authority",
  () => {
    const body =
      functionBody(
        "public.cing_wallet_create_manual_pos_session_v2("
      );

    for (
      const forbidden of [
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


test(
  "all lifecycle functions are backend-only",
  () => {
    assert.match(
      db,
      /revoke all on function[\s\S]*cing_wallet_expire_stale_manual_pos_session_private_v1[\s\S]*from public,\s*anon,\s*authenticated/i
    );

    assert.match(
      db,
      /grant execute on function[\s\S]*cing_wallet_expire_stale_manual_pos_session_private_v1[\s\S]*to service_role/i
    );

    assert.match(
      db,
      /revoke all on function[\s\S]*cing_wallet_get_current_manual_pos_session_v1[\s\S]*from public,\s*anon,\s*authenticated/i
    );

    assert.match(
      db,
      /grant execute on function[\s\S]*cing_wallet_get_current_manual_pos_session_v1[\s\S]*to service_role/i
    );

    assert.match(
      db,
      /revoke all on function[\s\S]*cing_wallet_create_manual_pos_session_v2[\s\S]*from public,\s*anon,\s*authenticated/i
    );

    assert.match(
      db,
      /grant execute on function[\s\S]*cing_wallet_create_manual_pos_session_v2[\s\S]*to service_role/i
    );
  }
);


test(
  "expired request replay cannot resurrect a manual QR",
  () => {
    const prepareV2 =
      fs.readFileSync(
        "db/migrations/20260914_cing_wallet_pos_manual_payment_bridge_v2.sql",
        "utf8"
      );

    const intentAuthority =
      fs.readFileSync(
        "db/migrations/20260909_cing_wallet_pos_payment_intent_authority_v1.sql",
        "utf8"
      );

    const sessionCreate =
      functionBody(
        "public.cing_wallet_create_manual_pos_session_v2("
      );

    assert.match(
      sessionCreate,
      /manual_request_id\s*=\s*p_request_id[\s\S]*return query[\s\S]*v_existing\.status[\s\S]*false/i
    );

    assert.match(
      prepareV2,
      /cing_wallet_create_manual_pos_session_v2/i
    );

    assert.match(
      prepareV2,
      /'ipos:'[\s\S]*v_session\.pos_parent[\s\S]*v_session\.pos_id[\s\S]*':session:'[\s\S]*v_session\.session_id::text/i
    );

    assert.match(
      prepareV2,
      /cing_wallet_create_pos_payment_intent_v1/i
    );

    assert.match(
      intentAuthority,
      /expiry is frozen on first creation/i
    );

    assert.match(
      intentAuthority,
      /v_existing\.status\s*=\s*'pending'[\s\S]*v_existing\.expires_at\s*<=\s*v_now[\s\S]*status\s*=\s*'expired'/i
    );

    assert.doesNotMatch(
      intentAuthority,
      /v_existing\.status\s*=\s*'expired'[\s\S]{0,1000}status\s*=\s*'pending'/i
    );

    assert.doesNotMatch(
      intentAuthority,
      /update\s+public\.cing_wallet_pos_payment_intents[\s\S]{0,700}set[\s\S]{0,500}expires_at\s*=/i
    );

    assert.doesNotMatch(
      intentAuthority,
      /update\s+public\.cing_wallet_pos_payment_intents[\s\S]{0,700}payment_token_id\s*=/i
    );
  }
);


test(
  "historical expired session and intent propagate terminal status through prepare V2",
  () => {
    const source =
      fs.readFileSync(
        "db/migrations/20260914_cing_wallet_pos_manual_payment_bridge_v2.sql",
        "utf8"
      );

    const start =
      source.indexOf(
        "public.cing_wallet_prepare_manual_pos_payment_v2("
      );

    assert.ok(
      start >= 0
    );

    const end =
      source.indexOf(
        "\n$$;",
        start
      );

    assert.ok(
      end > start
    );

    const body =
      source.slice(
        start,
        end + 4
      );

    assert.match(
      body,
      /v_link\.status/
    );

    assert.match(
      body,
      /v_intent\.status/
    );

    assert.match(
      body,
      /v_intent\.expires_at/
    );

    assert.doesNotMatch(
      body,
      /status\s*:=\s*'qr_ready'/i
    );

    assert.doesNotMatch(
      body,
      /status\s*:=\s*'pending'/i
    );
  }
);


test(
  "Node refuses to sign or return QR unless PostgreSQL returns qr_ready plus pending",
  () => {
    const source =
      fs.readFileSync(
        "services/wallet/cingWalletPosSessionService.js",
        "utf8"
      );

    const start =
      source.indexOf(
        "async function prepareManualPosPaymentQr"
      );

    const end =
      source.indexOf(
        "\nasync function freezeAmountAndCreateQr",
        start
      );

    assert.ok(
      start >= 0 &&
      end > start
    );

    const body =
      source.slice(
        start,
        end
      );

    const stateGuard =
      body.indexOf(
        'prepared.session_status !==\n      "qr_ready"'
      );

    const pendingGuard =
      body.indexOf(
        'prepared.payment_status !==\n      "pending"'
      );

    const invalidState =
      body.indexOf(
        "CING_WALLET_POS_MANUAL_STATE_INVALID"
      );

    const signQr =
      body.indexOf(
        "createQrCapability"
      );

    assert.ok(
      stateGuard >= 0,
      "missing qr_ready guard"
    );

    assert.ok(
      pendingGuard >= 0,
      "missing pending guard"
    );

    assert.ok(
      invalidState > stateGuard,
      "missing fail-closed state error"
    );

    assert.ok(
      signQr > invalidState,
      "QR signing must happen only after terminal-state guard"
    );

    assert.match(
      body,
      /prepared\.session_status\s*!==[\s\S]*"qr_ready"[\s\S]*prepared\.payment_status\s*!==[\s\S]*"pending"/
    );
  }
);


test(
  "same expired request cannot obtain a new token or expiry through prepare orchestration",
  () => {
    const prepareV2 =
      fs.readFileSync(
        "db/migrations/20260914_cing_wallet_pos_manual_payment_bridge_v2.sql",
        "utf8"
      );

    const intentAuthority =
      fs.readFileSync(
        "db/migrations/20260909_cing_wallet_pos_payment_intent_authority_v1.sql",
        "utf8"
      );

    assert.match(
      prepareV2,
      /:session:[\s\S]*v_session\.session_id::text/i
    );

    assert.match(
      intentAuthority,
      /where i\.provider = 'ipos'[\s\S]*i\.provider_request_key\s*=\s*v_request_key[\s\S]*for update/i
    );

    assert.match(
      intentAuthority,
      /return query[\s\S]*v_existing\.payment_token_id[\s\S]*v_existing\.expires_at/i
    );

    assert.doesNotMatch(
      intentAuthority,
      /update[\s\S]{0,700}payment_token_id\s*=/i
    );

    assert.doesNotMatch(
      intentAuthority,
      /update[\s\S]{0,700}expires_at\s*=/i
    );
  }
);
