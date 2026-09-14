const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(
  __dirname,
  "../../.."
);

const DB_FILE = path.join(
  ROOT,
  "db/migrations/20260914_cing_wallet_pos_prepare_manual_payment_ambiguity_fix_v1.sql"
);

const SB_FILE = path.join(
  ROOT,
  "supabase/migrations/20260914124000_cing_wallet_pos_prepare_manual_payment_ambiguity_fix_v1.sql"
);

const read = file =>
  fs.readFileSync(file, "utf8");

test(
  "ambiguity fix migrations remain exact mirrors",
  () => {
    assert.equal(
      read(DB_FILE),
      read(SB_FILE)
    );
  }
);

test(
  "V3 aliases payment intent target and qualifies identity columns",
  () => {
    const sql = read(SB_FILE);

    assert.match(
      sql,
      /update\s+public\.cing_wallet_pos_payment_intents\s+as\s+pi/i
    );

    assert.match(
      sql,
      /where\s+pi\.id\s*=/i
    );

    assert.match(
      sql,
      /and\s+pi\.pos_parent\s*=/i
    );

    assert.match(
      sql,
      /and\s+pi\.pos_id\s*=/i
    );

    assert.doesNotMatch(
      sql,
      /\bwhere\s+id\s*=/i
    );

    assert.doesNotMatch(
      sql,
      /\band\s+pos_parent\s*=/i
    );

    assert.doesNotMatch(
      sql,
      /\band\s+pos_id\s*=/i
    );
  }
);

test(
  "payment intent metadata reads are explicitly qualified",
  () => {
    const sql = read(SB_FILE);

    assert.match(
      sql,
      /set\s+metadata\s*=/i
    );

    assert.match(
      sql,
      /pi\.metadata->>'store_id'/i
    );

    assert.match(
      sql,
      /returning\s+pi\.metadata\s+into/i
    );

    assert.doesNotMatch(
      sql,
      /(?<!\.)\bmetadata->>/i
    );
  }
);

test(
  "financial business flow remains V3 -> V2 with cashier_manual",
  () => {
    const sql = read(SB_FILE);

    assert.match(
      sql,
      /cing_wallet_prepare_manual_pos_payment_v2\s*\(/i
    );

    assert.match(
      sql,
      /v_store\.pos_parent/i
    );

    assert.match(
      sql,
      /v_store\.pos_id/i
    );

    assert.match(
      sql,
      /'cashier_manual'/i
    );

    assert.match(
      sql,
      /CING_WALLET_POS_STORE_SNAPSHOT_CONFLICT/i
    );
  }
);

test(
  "V3 remains security definer and service-role only",
  () => {
    const sql = read(SB_FILE);

    assert.match(
      sql,
      /security\s+definer/i
    );

    assert.match(
      sql,
      /revoke\s+all\s+on\s+function[\s\S]*from\s+public,\s*anon,\s*authenticated/i
    );

    assert.match(
      sql,
      /grant\s+execute\s+on\s+function[\s\S]*to\s+service_role/i
    );
  }
);
