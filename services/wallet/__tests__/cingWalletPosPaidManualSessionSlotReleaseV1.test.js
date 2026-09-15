const fs = require("fs");
const path = require("path");

const dbPath = path.resolve(
  __dirname,
  "../../../db/migrations/20260915_cing_wallet_pos_paid_manual_session_slot_release_v1.sql"
);

const sbPath = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260915143000_cing_wallet_pos_paid_manual_session_slot_release_v1.sql"
);

const sql = fs.readFileSync(dbPath, "utf8");
const mirror = fs.readFileSync(sbPath, "utf8");

function rpcBody(source) {
  const start = source.search(
    /create\s+or\s+replace\s+function\s*public\.cing_wallet_create_manual_pos_session_v2\s*\(/i
  );

  expect(start).toBeGreaterThanOrEqual(0);

  const tail = source.slice(start);
  const end = tail.search(/\n\$\$;\s*/);

  expect(end).toBeGreaterThanOrEqual(0);

  return tail.slice(0, end + 4);
}

function busyQuery(source) {
  const rpc = rpcBody(source);

  const match = rpc.match(
    /select\s+s\.\*\s*into\s+v_busy\s*from\s+public\.cing_wallet_pos_sessions\s+s\s*where[\s\S]*?and\s+s\.status\s+in\s*\([\s\S]*?\)\s*limit\s+1\s*for\s+update\s*;/i
  );

  expect(match).not.toBeNull();

  return match[0];
}

describe(
  "Cing Wallet POS paid manual session slot release V1",
  () => {
    test("migration mirrors are exact", () => {
      expect(mirror).toBe(sql);
    });

    test(
      "keeps the canonical create-session authority",
      () => {
        const rpc = rpcBody(sql);

        expect(rpc).toMatch(
          /pg_advisory_xact_lock/i
        );

        expect(rpc).toMatch(
          /cing_wallet_expire_stale_manual_pos_session_private_v1/i
        );

        expect(rpc).toMatch(
          /manual_request_id/i
        );

        expect(rpc).toMatch(
          /CING_WALLET_POS_MANUAL_REPLAY_CONFLICT/
        );
      }
    );

    test(
      "paid terminal session no longer occupies POS slot",
      () => {
        const busy = busyQuery(sql);

        expect(busy).not.toMatch(/'paid'/);
      }
    );

    test(
      "unfinished and reconciliation states remain fail-closed",
      () => {
        const busy = busyQuery(sql);

        expect(busy).toMatch(/'amount_frozen'/);
        expect(busy).toMatch(/'qr_ready'/);
        expect(busy).toMatch(
          /'reconciliation_pending'/
        );
      }
    );

    test(
      "busy authority remains scoped to manual/IPOS origins",
      () => {
        const busy = busyQuery(sql);

        expect(busy).toMatch(
          /s\.session_origin\s+in/i
        );

        expect(busy).toMatch(
          /'cashier_manual'/
        );

        expect(busy).toMatch(
          /'ipos_api'/
        );
      }
    );

    test(
      "does not delete historical session or intent evidence",
      () => {
        expect(sql).not.toMatch(
          /delete\s+from\s+public\.cing_wallet_pos_sessions/i
        );

        expect(sql).not.toMatch(
          /delete\s+from\s+public\.cing_wallet_pos_payment_intents/i
        );
      }
    );

    test(
      "contains no Wallet settlement or mutation authority",
      () => {
        expect(sql).not.toMatch(
          /cing_wallet_apply_mutation_private/i
        );

        expect(sql).not.toMatch(
          /cing_wallet_settle_pos_payment_atomic_v1/i
        );
      }
    );

    test(
      "contains no points spending rewards or Event11 authority",
      () => {
        const rpc = rpcBody(sql);

        expect(rpc).not.toMatch(
          /pending_rewards|updateMemberPoint|addPoints|spending_leaderboard|event11/i
        );
      }
    );

    test(
      "RPC remains service-role only",
      () => {
        expect(sql).toMatch(
          /revoke\s+all\s+on\s+function[\s\S]*?from\s+public,\s*anon,\s*authenticated/i
        );

        expect(sql).toMatch(
          /grant\s+execute\s+on\s+function[\s\S]*?to\s+service_role/i
        );
      }
    );
  }
);
