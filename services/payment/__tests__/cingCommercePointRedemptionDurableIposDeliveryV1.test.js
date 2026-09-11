"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const migration =
  fs.readFileSync(
    "db/migrations/20260911_commerce_point_redemption_durable_ipos_delivery_v1.sql",
    "utf8"
  );

const worker =
  fs.readFileSync(
    "services/payment/commercePointRedemptionIposSyncWorker.js",
    "utf8"
  );

const server =
  fs.readFileSync(
    "server.js",
    "utf8"
  );


test(
  "historical reservations are fenced from blind replay",
  () => {
    assert.match(
      migration,
      /legacy_synced/
    );

    assert.match(
      migration,
      /existing historical reservations are never replayed blindly/i
    );
  }
);


test(
  "new reservation is not deliverable before successful consume",
  () => {
    assert.match(
      migration,
      /set default 'not_ready'/
    );

    assert.match(
      migration,
      /old\.status = 'reserved'[\s\S]*new\.status = 'consumed'[\s\S]*ipos_sync_status[\s\S]*'pending'/i
    );

    assert.match(
      migration,
      /old\.status = 'reserved'[\s\S]*new\.status = 'released'[\s\S]*'not_required'/i
    );
  }
);


test(
  "commerce redemption durable lifecycle supports recovery",
  () => {
    for (
      const status of [
        "pending",
        "processing",
        "synced",
        "failed",
      ]
    ) {
      assert.match(
        migration,
        new RegExp(status)
      );
    }

    assert.match(
      worker,
      /releaseStuckRows/
    );

    assert.match(
      worker,
      /ipos_locked_until/
    );

    assert.match(
      worker,
      /ipos_retry_count/
    );
  }
);


test(
  "worker uses immutable payment marker and MINUS",
  () => {
    assert.match(
      worker,
      /CING-COMMERCE-POINTS-\$\{id\}/
    );

    assert.match(
      worker,
      /type_change:[\s\S]*"MINUS"/
    );

    assert.match(
      worker,
      /point_change:[\s\S]*points/
    );
  }
);


test(
  "worker performs bounded paginated preflight and postflight",
  () => {
    assert.match(
      worker,
      /MAX_PAGES = 100/
    );

    assert.match(
      worker,
      /findMembershipLogByNote/
    );

    assert.match(
      worker,
      /const preflight[\s\S]*if \(!preflight\.found\)[\s\S]*updateMemberPoint[\s\S]*const postflight/
    );

    assert.match(
      worker,
      /postflight\.found/
    );
  }
);


test(
  "external snapshot guard protects commerce points from reserve through iPOS delivery",
  () => {
    assert.match(
      migration,
      /r\.status = 'reserved'[\s\S]*r\.ipos_sync_status = 'not_ready'/i
    );

    assert.match(
      migration,
      /r\.status = 'consumed'[\s\S]*r\.ipos_sync_status in \([\s\S]*'pending'[\s\S]*'processing'[\s\S]*'failed'/i
    );

    assert.match(
      migration,
      /cing_block_puzzle_continue_purchases/
    );
  }
);


test(
  "released reservation is outside external snapshot protection",
  () => {
    const guardStart =
      migration.indexOf(
        "Commerce durable redemption fence."
      );

    const guardEnd =
      migration.indexOf(
        "if v_protected then",
        guardStart
      );

    assert.ok(
      guardStart >= 0
    );

    assert.ok(
      guardEnd > guardStart
    );

    const region =
      migration.slice(
        guardStart,
        guardEnd
      );

    assert.doesNotMatch(
      region,
      /r\.status = 'released'/i
    );
  }
);


test(
  "commerce delivery never mutates local player point balance",
  () => {
    assert.doesNotMatch(
      worker,
      /\.from\(\s*["']players["']\s*\)[\s\S]*\.update/
    );

    const triggerStart =
      migration.indexOf(
        "public.cing_commerce_point_redemption_ipos_state_v1()"
      );

    const triggerEnd =
      migration.indexOf(
        "drop trigger if exists",
        triggerStart
      );

    assert.ok(
      triggerStart >= 0
    );

    assert.ok(
      triggerEnd >
        triggerStart
    );

    const triggerRegion =
      migration.slice(
        triggerStart,
        triggerEnd
      );

    assert.doesNotMatch(
      triggerRegion,
      /update public\.players/i
    );

    assert.doesNotMatch(
      triggerRegion,
      /set total_points/i
    );
  }
);


test(
  "worker is mounted in server bootstrap",
  () => {
    assert.match(
      server,
      /startCommercePointRedemptionIposSyncWorker/
    );

    assert.match(
      server,
      /Commerce Point Redemption iPOS Sync Worker|COMMERCE POINT REDEMPTION IPOS SYNC/
    );
  }
);


test(
  "migration mirrors are byte-identical",
  () => {
    const db =
      fs.readFileSync(
        "db/migrations/20260911_commerce_point_redemption_durable_ipos_delivery_v1.sql",
        "utf8"
      );

    const sb =
      fs.readFileSync(
        "supabase/migrations/20260911150000_commerce_point_redemption_durable_ipos_delivery_v1.sql",
        "utf8"
      );

    assert.equal(
      db,
      sb
    );
  }
);


test(
  "cutover preserves genuinely in-flight reservation but fences expired history",
  () => {
    assert.match(
      migration,
      /r\.status = 'reserved'[\s\S]*p\.payment_status = 'pending'[\s\S]*p\.expired_at > clock_timestamp\(\)[\s\S]*'not_ready'/i
    );

    assert.match(
      migration,
      /else[\s\S]*'legacy_synced'/i
    );

    assert.match(
      migration,
      /from public\.payment_transactions p/i
    );
  }
);


test(
  "historical expired reservation is never auto-released by new worker",
  () => {
    assert.match(
      worker,
      /Only not_ready rows are eligible here/i
    );

    assert.match(
      worker,
      /\.eq\(\s*"ipos_sync_status",\s*"not_ready"\s*\)/m
    );

    assert.doesNotMatch(
      worker,
      /\.eq\(\s*"ipos_sync_status",\s*"legacy_synced"\s*\)[\s\S]*cing_commerce_release_payment_points_v1/m
    );
  }
);


test(
  "expiry recovery delegates financial mutation to PostgreSQL release authority",
  () => {
    assert.match(
      worker,
      /recoverTerminalPointReservations[\s\S]*cing_commerce_release_payment_points_v1/
    );

    assert.match(
      worker,
      /payment_expired_auto_recovery/
    );

    assert.match(
      worker,
      /payment_failed_auto_recovery/
    );

    assert.doesNotMatch(
      worker,
      /recoverTerminalPointReservations[\s\S]*\.from\(\s*"players"\s*\)[\s\S]*\.update/
    );
  }
);


test(
  "expiry recovery tolerates concurrent payment settlement safely",
  () => {
    assert.match(
      worker,
      /COMMERCE_POINT_RELEASE_PAYMENT_ALREADY_SETTLED/
    );

    assert.match(
      worker,
      /COMMERCE_POINT_RELEASE_PAYMENT_NOT_TERMINAL/
    );

    assert.match(
      worker,
      /COMMERCE_POINT_RELEASE_ALREADY_CONSUMED/
    );
  }
);


test(
  "iPOS first attempt timestamp is write-once",
  () => {
    assert.match(
      worker,
      /markFirstAttemptIfMissing/
    );

    assert.match(
      worker,
      /\.is\(\s*"ipos_first_attempt_at",\s*null\s*\)/
    );

    const claimStart =
      worker.indexOf(
        "async function claimPendingRows"
      );

    const claimEnd =
      worker.indexOf(
        "async function markFirstAttemptIfMissing",
        claimStart
      );

    assert.ok(
      claimStart >= 0
    );

    assert.ok(
      claimEnd > claimStart
    );

    const claimRegion =
      worker.slice(
        claimStart,
        claimEnd
      );

    assert.doesNotMatch(
      claimRegion,
      /ipos_first_attempt_at:\s*nowIso\(\)/
    );
  }
);


test(
  "legacy state-only reconciliation never mutates player balance",
  () => {
    const start =
      migration.indexOf(
        "public.cing_commerce_reconcile_legacy_reservation_without_balance_v1("
      );

    const end =
      migration.indexOf(
        "/* ============================================================\n * 5. BACKEND-ONLY ACL",
        start
      );

    assert.ok(
      start >= 0
    );

    assert.ok(
      end > start
    );

    const region =
      migration.slice(
        start,
        end
      );

    assert.doesNotMatch(
      region,
      /update\s+public\.players/i
    );

    assert.doesNotMatch(
      region,
      /set\s+total_points/i
    );

    assert.match(
      region,
      /update[\s\S]*public\.commerce_point_reservations/i
    );
  }
);


test(
  "legacy reconciliation requires exact forensic cutover state",
  () => {
    assert.match(
      migration,
      /v_reservation\.status[\s\S]*'reserved'/i
    );

    assert.match(
      migration,
      /v_reservation\.ipos_sync_status[\s\S]*'legacy_synced'/i
    );

    assert.match(
      migration,
      /p_expected_user_id/i
    );

    assert.match(
      migration,
      /p_expected_points/i
    );

    assert.match(
      migration,
      /payment_status = 'failed'[\s\S]*payment_status = 'pending'[\s\S]*expired_at/i
    );
  }
);


test(
  "legacy reconciliation fails closed for settled payment",
  () => {
    assert.match(
      migration,
      /payment_status = 'paid'/i
    );

    assert.match(
      migration,
      /order_created is true/i
    );

    assert.match(
      migration,
      /settlement_verified_at[\s\S]*is not null/i
    );

    assert.match(
      migration,
      /settlement_consumed_at[\s\S]*is not null/i
    );
  }
);


test(
  "legacy reconciliation is service-role only",
  () => {
    assert.match(
      migration,
      /revoke all[\s\S]*cing_commerce_reconcile_legacy_reservation_without_balance_v1[\s\S]*from public/i
    );

    assert.match(
      migration,
      /revoke all[\s\S]*cing_commerce_reconcile_legacy_reservation_without_balance_v1[\s\S]*from anon/i
    );

    assert.match(
      migration,
      /revoke all[\s\S]*cing_commerce_reconcile_legacy_reservation_without_balance_v1[\s\S]*from authenticated/i
    );

    assert.match(
      migration,
      /grant execute[\s\S]*cing_commerce_reconcile_legacy_reservation_without_balance_v1[\s\S]*to service_role/i
    );
  }
);
