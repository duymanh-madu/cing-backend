"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const root =
  path.resolve(
    __dirname,
    "../../.."
  );

const migration =
  fs.readFileSync(
    path.join(
      root,
      "db/migrations/20260914_cing_wallet_pos_reconciliation_alert_store_projection_v1.sql"
    ),
    "utf8"
  );

const migrationMirror =
  fs.readFileSync(
    path.join(
      root,
      "supabase/migrations/20260914060000_cing_wallet_pos_reconciliation_alert_store_projection_v1.sql"
    ),
    "utf8"
  );

const service =
  fs.readFileSync(
    path.join(
      root,
      "services/wallet/cingWalletPosSessionService.js"
    ),
    "utf8"
  );

const routes =
  fs.readFileSync(
    path.join(
      root,
      "routes/adminWalletPosRoutes.js"
    ),
    "utf8"
  );


test(
  "alert store projection migration mirrors remain byte-identical",
  () => {
    assert.equal(
      migration,
      migrationMirror
    );
  }
);


test(
  "projection is backend service-role read authority only",
  () => {
    assert.match(
      migration,
      /create or replace function[\s\S]*cing_wallet_list_pos_reconciliation_alerts_v2/
    );

    assert.match(
      migration,
      /security definer/
    );

    assert.match(
      migration,
      /revoke all on function[\s\S]*cing_wallet_list_pos_reconciliation_alerts_v2[\s\S]*from public, anon, authenticated/
    );

    assert.match(
      migration,
      /grant execute on function[\s\S]*cing_wallet_list_pos_reconciliation_alerts_v2[\s\S]*to service_role/
    );
  }
);


test(
  "projection joins alert to canonical session and immutable payment intent snapshot",
  () => {
    assert.match(
      migration,
      /cing_wallet_pos_reconciliation_alerts a[\s\S]*cing_wallet_pos_sessions ps[\s\S]*ps\.id[\s\S]*a\.session_id/
    );

    assert.match(
      migration,
      /cing_wallet_pos_payment_intents pi[\s\S]*pi\.id[\s\S]*ps\.payment_intent_id/
    );

    assert.match(
      migration,
      /pi\.metadata->>'store_id'/
    );

    assert.match(
      migration,
      /pi\.metadata->>'store_code'/
    );

    assert.match(
      migration,
      /pi\.metadata->>'store_display_name'/
    );
  }
);


test(
  "historical snapshot is preferred and live registry is legacy fallback only",
  () => {
    assert.match(
      migration,
      /then[\s\S]*pi\.metadata->>'store_id'[\s\S]*else[\s\S]*registry\.id/
    );

    assert.match(
      migration,
      /then[\s\S]*pi\.metadata->>'store_code'[\s\S]*else[\s\S]*registry\.store_code/
    );

    assert.match(
      migration,
      /then[\s\S]*pi\.metadata->>'store_display_name'[\s\S]*else[\s\S]*registry\.display_name/
    );
  }
);


test(
  "partial historical snapshot never silently falls back to live registry",
  () => {
    assert.match(
      migration,
      /pi\.metadata->>'store_id'[\s\S]*pi\.metadata->>'store_code'[\s\S]*pi\.metadata->>'store_display_name'[\s\S]*then[\s\S]*case[\s\S]*else[\s\S]*null/
    );
  }
);


test(
  "optional canonical store filter occurs before ordered limit result",
  () => {
    assert.match(
      migration,
      /p_store_id is null[\s\S]*projected_store_id[\s\S]*p_store_id[\s\S]*order by[\s\S]*last_detected_at desc[\s\S]*limit[\s\S]*v_limit/
    );
  }
);


test(
  "service performs one specialized projection RPC",
  () => {
    const start =
      service.indexOf(
        "async function listPosReconciliationAlerts"
      );

    const end =
      service.indexOf(
        "module.exports",
        start
      );

    const body =
      service.slice(
        start,
        end
      );

    assert.match(
      body,
      /cing_wallet_list_pos_reconciliation_alerts_v2/
    );

    assert.match(
      body,
      /p_store_id/
    );

    assert.doesNotMatch(
      body,
      /\.from\(\s*["']cing_wallet_pos_reconciliation_alerts["']/
    );

    assert.equal(
      (
        body.match(
          /supabase\.rpc\(/g
        ) || []
      ).length,
      1
    );
  }
);


test(
  "alert store filter is validated as UUID before database read",
  () => {
    const start =
      service.indexOf(
        "async function listPosReconciliationAlerts"
      );

    const end =
      service.indexOf(
        "module.exports",
        start
      );

    const body =
      service.slice(
        start,
        end
      );

    assert.match(
      body,
      /normalizeUuid\([\s\S]*CING_WALLET_POS_ALERT_STORE_ID_INVALID/
    );
  }
);


test(
  "GET reconciliation alerts requires exact Super Admin",
  () => {
    const start =
      routes.indexOf(
        'router.get(\n  "/reconciliation-alerts"'
      );

    const end =
      routes.indexOf(
        'router.get(\n  "/sessions"',
        start
      );

    const body =
      routes.slice(
        start,
        end
      );

    assert.match(
      body,
      /req\.admin\?\.role !==[\s\S]*"super_admin"/
    );

    assert.match(
      body,
      /CING_WALLET_SUPER_ADMIN_REQUIRED/
    );
  }
);


test(
  "GET reconciliation alerts accepts store only as read filter",
  () => {
    const start =
      routes.indexOf(
        'router.get(\n  "/reconciliation-alerts"'
      );

    const end =
      routes.indexOf(
        'router.get(\n  "/sessions"',
        start
      );

    const body =
      routes.slice(
        start,
        end
      );

    assert.match(
      body,
      /storeId:[\s\S]*req\.query\?\.store_id/
    );
  }
);


test(
  "resolution POST remains decision-only with no store authority",
  () => {
    const postMatch =
      routes.match(
        /router\.post\s*\(\s*["']\/reconciliation-alerts\/:alertId\/resolve["']/
      );

    const getMatch =
      routes.match(
        /router\.get\s*\(\s*["']\/reconciliation-alerts["']/
      );

    assert.ok(
      postMatch,
      "resolution POST route must exist"
    );

    assert.ok(
      getMatch,
      "alert GET route must exist"
    );

    const start =
      postMatch.index;

    const end =
      getMatch.index;

    assert.ok(
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      end > start,
      "resolution POST must precede alert GET"
    );

    const body =
      routes.slice(
        start,
        end
      );

    for (
      const forbidden
      of [
        "store_id",
        "storeId",
        "pos_parent",
        "pos_id",
        "customer_user_id",
      ]
    ) {
      assert.doesNotMatch(
        body,
        new RegExp(
          `["']${forbidden}["']`
        )
      );
    }

    assert.match(
      body,
      /request_id/
    );

    assert.match(
      body,
      /resolution_action/
    );

    assert.match(
      body,
      /reason_code/
    );
  }
);


test(
  "projection migration contains no Wallet mutation or alert mutation authority",
  () => {
    assert.doesNotMatch(
      migration,
      /cing_wallet_apply_mutation_private/
    );

    assert.doesNotMatch(
      migration,
      /\bupdate\s+public\.cing_wallet_pos_reconciliation_alerts\b/i
    );

    assert.doesNotMatch(
      migration,
      /\binsert\s+into\s+public\.cing_wallet_pos_reconciliation_alerts\b/i
    );

    assert.doesNotMatch(
      migration,
      /\bdelete\s+from\b/i
    );
  }
);
