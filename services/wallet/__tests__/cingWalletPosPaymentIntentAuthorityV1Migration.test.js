"use strict";

const fs =
  require("node:fs");

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const migration =
  fs.readFileSync(
    "db/migrations/20260909_cing_wallet_pos_payment_intent_authority_v1.sql",
    "utf8"
  );

test(
  "POS payment intent has immutable provider request and QR token identities",
  () => {
    assert.match(
      migration,
      /payment_token_id uuid[\s\S]*provider_request_key text/i
    );

    assert.match(
      migration,
      /cing_wallet_pos_payment_intents_token_uq/i
    );

    assert.match(
      migration,
      /cing_wallet_pos_payment_intents_provider_request_uq/i
    );
  }
);

test(
  "POS amount is canonical database intent state and customer never supplies amount to settlement",
  () => {
    assert.match(
      migration,
      /amount bigint[\s\S]*not null/i
    );

    assert.match(
      migration,
      /cing_wallet_settle_pos_payment_atomic_v1\(\s*p_payment_token_id uuid,\s*p_user_id text\s*\)/i
    );

    const signature =
      migration.match(
        /cing_wallet_settle_pos_payment_atomic_v1\(([\s\S]*?)\)\s*returns table/i
      );

    assert.ok(signature);

    assert.doesNotMatch(
      signature[1],
      /p_amount/i
    );
  }
);

test(
  "customer is unknown at create and bound only after successful settlement",
  () => {
    const createSection =
      migration.slice(
        migration.indexOf(
          "public.cing_wallet_create_pos_payment_intent_v1("
        ),
        migration.indexOf(
          "public.cing_wallet_query_pos_payment_intent_v1("
        )
      );

    assert.doesNotMatch(
      createSection,
      /p_user_id/i
    );

    assert.match(
      migration,
      /customer_user_id\s*=\s*v_user_id/i
    );
  }
);

test(
  "POS settlement locks intent before Wallet mutation",
  () => {
    const lockPosition =
      migration.indexOf(
        "where i.payment_token_id =\n    p_payment_token_id\n  for update",
        migration.indexOf(
          "public.cing_wallet_settle_pos_payment_atomic_v1("
        )
      );

    const mutationPosition =
      migration.indexOf(
        "cing_wallet_apply_mutation_private(",
        migration.indexOf(
          "public.cing_wallet_settle_pos_payment_atomic_v1("
        )
      );

    assert.ok(
      lockPosition >= 0
    );

    assert.ok(
      mutationPosition >
        lockPosition
    );
  }
);

test(
  "POS settlement reuses canonical private Wallet mutation and deterministic idempotency",
  () => {
    assert.match(
      migration,
      /'wallet_pos_payment:intent:'[\s\S]*v_intent\.id::text/i
    );

    assert.match(
      migration,
      /cing_wallet_apply_mutation_private\([\s\S]*v_user_id[\s\S]*'payment'[\s\S]*-v_intent\.amount/i
    );

    assert.match(
      migration,
      /'pos_payment_intent'[\s\S]*v_intent\.id::text/i
    );
  }
);

test(
  "insufficient balance remains owned by existing Wallet primitive",
  () => {
    assert.match(
      migration,
      /CING_WALLET_INSUFFICIENT_BALANCE/
    );

    assert.doesNotMatch(
      migration,
      /update public\.cing_wallet_accounts[\s\S]*set[\s\S]*balance/i
    );
  }
);

test(
  "successful replay validates the committed ledger rather than debiting again",
  () => {
    assert.match(
      migration,
      /if v_intent\.status = 'paid'[\s\S]*cing_wallet_transactions[\s\S]*CING_WALLET_POS_LEDGER_CONFLICT[\s\S]*return query/i
    );
  }
);

test(
  "paid intent requires complete durable Wallet settlement proof",
  () => {
    assert.match(
      migration,
      /status = 'paid'[\s\S]*customer_user_id is not null[\s\S]*wallet_transaction_id is not null[\s\S]*paid_at is not null/i
    );
  }
);

test(
  "create replay cannot silently change POS bill amount",
  () => {
    assert.match(
      migration,
      /v_existing\.amount <>[\s\S]*p_amount[\s\S]*CING_WALLET_POS_CREATE_REPLAY_CONFLICT/i
    );
  }
);

test(
  "create replay never extends QR expiry",
  () => {
    assert.match(
      migration,
      /Expiry is frozen on first creation/i
    );

    const existingBranch =
      migration.slice(
        migration.indexOf(
          "if found then"
        ),
        migration.indexOf(
          "insert into public.cing_wallet_pos_payment_intents"
        )
      );

    assert.doesNotMatch(
      existingBranch,
      /expires_at\s*=\s*p_expires_at/i
    );
  }
);

test(
  "POS authorities are backend only",
  () => {
    assert.match(
      migration,
      /revoke all on function[\s\S]*cing_wallet_settle_pos_payment_atomic_v1\(uuid, text\)[\s\S]*from public, anon, authenticated/i
    );

    assert.match(
      migration,
      /grant execute on function[\s\S]*cing_wallet_settle_pos_payment_atomic_v1\(uuid, text\)[\s\S]*to service_role/i
    );
  }
);

test(
  "migration mirror is byte identical",
  () => {
    const mirror =
      fs.readFileSync(
        "supabase/migrations/20260909112000_cing_wallet_pos_payment_intent_authority_v1.sql",
        "utf8"
      );

    assert.equal(
      mirror,
      migration
    );
  }
);
