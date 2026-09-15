"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const dbFile =
  "db/migrations/" +
  "20260915_cing_wallet_pos_settlement_status_ambiguity_fix_v1.sql";

const supabaseFile =
  "supabase/migrations/" +
  "20260915123000_cing_wallet_pos_settlement_status_ambiguity_fix_v1.sql";

const db = fs.readFileSync(dbFile, "utf8");
const supabase = fs.readFileSync(
  supabaseFile,
  "utf8"
);

test(
  "42702 repair migration mirrors remain byte-identical",
  () => {
    assert.equal(db, supabase);
  }
);

test(
  "settlement keeps exact existing RPC signature",
  () => {
    assert.match(
      db,
      /public\.cing_wallet_settle_pos_payment_atomic_v1\(\s*p_payment_token_id uuid,\s*p_user_id text\s*\)/
    );

    assert.match(
      db,
      /returns table \(\s*applied boolean,\s*intent_id uuid,\s*wallet_transaction_id uuid,\s*amount bigint,\s*wallet_balance_after bigint,\s*status text,\s*paid_at timestamptz\s*\)/
    );
  }
);

test(
  "consume update qualifies ambiguous payment-intent status",
  () => {
    assert.match(
      db,
      /update public\.cing_wallet_pos_payment_intents as target_intent/
    );

    assert.match(
      db,
      /where target_intent\.id = v_intent\.id\s*and target_intent\.status = 'pending'/
    );

    assert.match(
      db,
      /returning target_intent\.\*\s*into v_intent/
    );

    assert.doesNotMatch(
      db,
      /where id = v_intent\.id\s*and status = 'pending'/
    );
  }
);

test(
  "repair preserves canonical Wallet mutation authority",
  () => {
    const calls =
      db.match(
        /cing_wallet_apply_mutation_private\s*\(/g
      ) || [];

    assert.equal(calls.length, 1);

    assert.match(
      db,
      /'wallet_pos_payment:intent:'\s*\|\|\s*v_intent\.id::text/
    );

    assert.match(
      db,
      /'payment',\s*-v_intent\.amount,\s*v_idempotency_key/
    );

    assert.match(
      db,
      /'pos_payment_intent',\s*v_intent\.id::text/
    );
  }
);

test(
  "repair preserves immutable store snapshot settlement",
  () => {
    assert.match(
      db,
      /v_intent\.metadata->>'store_id'/
    );

    assert.match(
      db,
      /v_intent\.metadata->>'store_code'/
    );

    assert.match(
      db,
      /v_intent\.metadata->>'store_display_name'/
    );

    assert.doesNotMatch(
      db,
      /from public\.cing_wallet_pos_store_registry/
    );
  }
);

test(
  "repair preserves backend-only execution boundary",
  () => {
    assert.match(
      db,
      /security definer/
    );

    assert.match(
      db,
      /revoke all on function[\s\S]*from public, anon, authenticated/
    );

    assert.match(
      db,
      /grant execute on function[\s\S]*to service_role/
    );
  }
);

test(
  "repair does not introduce alternate financial authority",
  () => {
    assert.doesNotMatch(
      db,
      /\bdelete\s+from\b/i
    );

    assert.doesNotMatch(
      db,
      /\bcing_wallet_admin_adjust/i
    );

    assert.doesNotMatch(
      db,
      /\bloyalty\b/i
    );

    assert.doesNotMatch(
      db,
      /\bpending_rewards\b/i
    );
  }
);
