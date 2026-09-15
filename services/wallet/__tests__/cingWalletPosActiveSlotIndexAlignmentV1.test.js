const fs = require("fs");
const path = require("path");

const dbPath = path.resolve(
  __dirname,
  "../../../db/migrations/20260915_cing_wallet_pos_active_slot_index_alignment_v1.sql"
);

const supabasePath = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260915153000_cing_wallet_pos_active_slot_index_alignment_v1.sql"
);

const dbSql = fs.readFileSync(dbPath, "utf8");
const supabaseSql = fs.readFileSync(supabasePath, "utf8");

function indexPredicate(sql) {
  const match = sql.match(
    /create\s+unique\s+index\s+cing_wallet_pos_sessions_active_payment_pos_uq[\s\S]*?where([\s\S]*?);/i
  );

  if (!match) {
    throw new Error(
      "active payment POS unique index definition not found"
    );
  }

  return match[1];
}

describe(
  "Cing Wallet POS active slot index alignment V1",
  () => {
    test("migration mirrors are exact", () => {
      expect(dbSql).toBe(supabaseSql);
    });

    test("replaces the canonical active payment POS unique index", () => {
      expect(dbSql).toMatch(
        /drop\s+index\s+if\s+exists\s+public\.cing_wallet_pos_sessions_active_payment_pos_uq/i
      );

      expect(dbSql).toMatch(
        /create\s+unique\s+index\s+cing_wallet_pos_sessions_active_payment_pos_uq/i
      );
    });

    test("index remains scoped to the exact POS identity", () => {
      expect(dbSql).toMatch(
        /on\s+public\.cing_wallet_pos_sessions\s*\(\s*pos_parent\s*,\s*pos_id\s*\)/i
      );
    });

    test("manual and iPOS API origins remain protected", () => {
      const predicate =
        indexPredicate(dbSql);

      expect(predicate).toMatch(
        /session_origin\s+in\s*\([\s\S]*'cashier_manual'[\s\S]*'ipos_api'[\s\S]*\)/i
      );
    });

    test("unfinished states continue occupying the POS slot", () => {
      const predicate =
        indexPredicate(dbSql);

      expect(predicate).toMatch(
        /status\s+in\s*\([\s\S]*'amount_frozen'[\s\S]*'qr_ready'[\s\S]*'reconciliation_pending'[\s\S]*\)/i
      );
    });

    test("paid terminal state no longer occupies the POS slot", () => {
      const predicate =
        indexPredicate(dbSql);

      expect(predicate).not.toMatch(
        /'paid'/i
      );
    });

    test("does not mutate historical sessions or payment intents", () => {
      expect(dbSql).not.toMatch(
        /\b(update|delete|insert)\s+(into\s+|from\s+)?public\.cing_wallet_pos_sessions\b/i
      );

      expect(dbSql).not.toMatch(
        /\b(update|delete|insert)\s+(into\s+|from\s+)?public\.cing_wallet_pos_payment_intents\b/i
      );
    });

    test("contains no financial or reward mutation authority", () => {
      const executable =
        dbSql.replace(
          /\/\*[\s\S]*?\*\//g,
          ""
        );

      expect(executable).not.toMatch(
        /cing_wallet_apply_mutation|wallet_transactions|loyalty|points|spending|reward|event11|event_11/i
      );
    });
  }
);
