"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");


const root =
  path.resolve(
    __dirname,
    "../../.."
  );

const dbPath =
  path.join(
    root,
    "db/migrations/20260913_cing_wallet_pos_session_authority_v1.sql"
  );

const supabasePath =
  path.join(
    root,
    "supabase/migrations/20260913173000_cing_wallet_pos_session_authority_v1.sql"
  );

const sql =
  fs.readFileSync(
    dbPath,
    "utf8"
  );

const supabaseSql =
  fs.readFileSync(
    supabasePath,
    "utf8"
  );


test(
  "migration mirrors are byte-identical",
  () => {
    assert.equal(
      sql,
      supabaseSql
    );
  }
);


test(
  "POS session has one canonical iPOS bill identity",
  () => {
    assert.match(
      sql,
      /create unique index\s+cing_wallet_pos_sessions_bill_identity_uq[\s\S]*pos_parent[\s\S]*pos_id[\s\S]*sale_tran_id/i
    );
  }
);


test(
  "Event 2 line items are discovery snapshots rather than amount authority",
  () => {
    assert.match(
      sql,
      /Event 2 item totals are NEVER payment authority/i
    );

    assert.match(
      sql,
      /line_items_snapshot jsonb/i
    );

    assert.doesNotMatch(
      sql,
      /sum\s*\([^)]*line_items_snapshot/i
    );
  }
);


test(
  "amount authority is future-ready for cashier manual and iPOS API sources",
  () => {
    assert.match(
      sql,
      /amount_source[\s\S]*'cashier_manual'[\s\S]*'ipos_api'/i
    );

    assert.match(
      sql,
      /public\.cing_wallet_freeze_pos_session_amount_v1/i
    );
  }
);


test(
  "amount freeze is immutable and replay-safe",
  () => {
    assert.match(
      sql,
      /v_session\.status\s*=\s*'awaiting_amount'[\s\S]*amount_frozen_at[\s\S]*'amount_frozen'/i
    );

    assert.match(
      sql,
      /v_session\.amount\s*=\s*p_amount[\s\S]*v_session\.amount_source\s*=\s*v_source[\s\S]*false/i
    );

    assert.match(
      sql,
      /CING_WALLET_POS_SESSION_AMOUNT_IMMUTABLE/i
    );
  }
);


test(
  "payment intent is linked only after frozen amount and exact semantics match",
  () => {
    assert.match(
      sql,
      /v_session\.status\s*<>\s*'amount_frozen'/i
    );

    assert.match(
      sql,
      /v_intent\.pos_parent\s*<>[\s\S]*v_session\.pos_parent/i
    );

    assert.match(
      sql,
      /v_intent\.pos_id\s*<>[\s\S]*v_session\.pos_id/i
    );

    assert.match(
      sql,
      /v_intent\.bill_reference[\s\S]*v_session\.sale_tran_id/i
    );

    assert.match(
      sql,
      /v_intent\.amount\s*<>[\s\S]*v_session\.amount/i
    );

    assert.match(
      sql,
      /CING_WALLET_POS_SESSION_INTENT_MISMATCH/i
    );
  }
);


test(
  "existing POS payment intent remains the downstream financial authority",
  () => {
    assert.match(
      sql,
      /references public\.cing_wallet_pos_payment_intents\(id\)/i
    );

    assert.doesNotMatch(
      sql,
      /cing_wallet_apply_mutation_private\s*\(/i
    );

    assert.doesNotMatch(
      sql,
      /update\s+public\.cing_wallet_accounts/i
    );

    assert.doesNotMatch(
      sql,
      /insert\s+into\s+public\.cing_wallet_transactions/i
    );
  }
);


test(
  "session audit is append-only through backend-only authorities",
  () => {
    assert.match(
      sql,
      /create table public\.cing_wallet_pos_session_audit/i
    );

    assert.match(
      sql,
      /EVENT2_RECEIVED/i
    );

    assert.match(
      sql,
      /AMOUNT_FROZEN/i
    );

    assert.match(
      sql,
      /PAYMENT_INTENT_LINKED/i
    );

    assert.match(
      sql,
      /revoke all[\s\S]*cing_wallet_pos_session_audit[\s\S]*service_role/i
    );
  }
);


test(
  "customer and authenticated roles cannot execute POS session financial orchestration",
  () => {
    assert.match(
      sql,
      /revoke all on function[\s\S]*cing_wallet_freeze_pos_session_amount_v1[\s\S]*from public, anon, authenticated/i
    );

    assert.match(
      sql,
      /grant execute on function[\s\S]*cing_wallet_freeze_pos_session_amount_v1[\s\S]*to service_role/i
    );

    assert.match(
      sql,
      /revoke all on function[\s\S]*cing_wallet_link_pos_session_payment_intent_v1[\s\S]*from public, anon, authenticated/i
    );
  }
);


test(
  "future native iPOS QR mode is reserved without changing current merchant QR mode",
  () => {
    assert.match(
      sql,
      /payment_entry_mode[\s\S]*'merchant_dynamic_qr'[\s\S]*'ipos_native_qr'/i
    );
  }
);


test(
  "first-create Event 2 concurrency is arbitrated by canonical bill identity",
  () => {
    assert.match(
      sql,
      /insert into public\.cing_wallet_pos_sessions[\s\S]*on conflict\s*\(\s*pos_parent,\s*pos_id,\s*sale_tran_id\s*\)\s*do nothing[\s\S]*returning \*/
    );

    assert.match(
      sql,
      /if v_created\.id is not null then/
    );

    assert.match(
      sql,
      /CING_WALLET_POS_SESSION_CONFLICT_ROW_MISSING/
    );

    const functionStart =
      sql.indexOf(
        "public.cing_wallet_upsert_pos_session_from_event2_v1("
      );

    const freezeStart =
      sql.indexOf(
        "public.cing_wallet_freeze_pos_session_amount_v1(",
        functionStart
      );

    const block =
      sql.slice(
        functionStart,
        freezeStart
      );

    const insertAt =
      block.indexOf(
        "insert into public.cing_wallet_pos_sessions"
      );

    const selectAt =
      block.indexOf(
        "from public.cing_wallet_pos_sessions s"
      );

    assert.ok(
      insertAt >= 0
    );

    assert.ok(
      selectAt >
        insertAt,
      "Event 2 must insert-first rather than SELECT-first"
    );
  }
);


test(
  "cancelled and expired sessions allow coherent pre-amount or post-freeze state",
  () => {
    assert.match(
      sql,
      /status in \(\s*'cancelled',\s*'expired'\s*\)[\s\S]*amount is null[\s\S]*amount_source is null[\s\S]*amount_frozen_at is null[\s\S]*or[\s\S]*amount is not null[\s\S]*amount_source is not null[\s\S]*amount_frozen_at is not null/
    );

    assert.doesNotMatch(
      sql,
      /status <> 'awaiting_amount'[\s\S]{0,180}amount is not null/
    );
  }
);


test(
  "active financial states still require complete frozen amount tuple",
  () => {
    assert.match(
      sql,
      /status in \(\s*'amount_frozen',\s*'qr_ready',\s*'paid',\s*'reconciliation_pending',\s*'reconciled',\s*'reconciliation_mismatch'\s*\)[\s\S]*amount is not null[\s\S]*amount_source is not null[\s\S]*amount_frozen_at is not null/
    );
  }
);
