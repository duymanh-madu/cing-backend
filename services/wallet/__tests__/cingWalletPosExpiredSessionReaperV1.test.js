const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

const dbMigration = fs.readFileSync(
  "db/migrations/20260914_cing_wallet_pos_expired_session_reaper_v1.sql",
  "utf8"
);

const supabaseMigration = fs.readFileSync(
  "supabase/migrations/20260914233000_cing_wallet_pos_expired_session_reaper_v1.sql",
  "utf8"
);

const lifecycleMigration = fs.readFileSync(
  "db/migrations/20260914_cing_wallet_pos_expired_manual_session_lifecycle_v1.sql",
  "utf8"
);

const worker = fs.readFileSync(
  "services/wallet/workers/cingWalletPosExpiredSessionReaperWorker.js",
  "utf8"
);

const server = fs.readFileSync(
  "server.js",
  "utf8"
);

const posPaymentService = fs.readFileSync(
  "services/wallet/cingWalletPosPaymentService.js",
  "utf8"
);

test("reaper migration mirrors are byte-identical", () => {
  assert.equal(dbMigration, supabaseMigration);
});

test("batch authority is service-role only", () => {
  assert.match(
    dbMigration,
    /revoke all on function[\s\S]*cing_wallet_expire_stale_manual_pos_sessions_batch_v1[\s\S]*from public, anon, authenticated/i
  );
  assert.match(
    dbMigration,
    /grant execute on function[\s\S]*cing_wallet_expire_stale_manual_pos_sessions_batch_v1[\s\S]*to service_role/i
  );
});

test("batch authority has a global non-blocking advisory run fence", () => {
  assert.match(
    dbMigration,
    /pg_try_advisory_xact_lock[\s\S]*cing_wallet_pos_expired_session_reaper_v1/i
  );
});

test("reaper only discovers manual or API qr_ready sessions", () => {
  assert.match(
    dbMigration,
    /session_origin in[\s\S]*'cashier_manual'[\s\S]*'ipos_api'[\s\S]*status = 'qr_ready'/i
  );
});

test("reaper requires no customer or financial settlement proof", () => {
  assert.match(
    dbMigration,
    /customer_user_id is null[\s\S]*wallet_transaction_id is null[\s\S]*paid_at is null/i
  );
});

test("pending intent must be past immutable expiry", () => {
  assert.match(
    dbMigration,
    /i\.status = 'pending'[\s\S]*i\.expires_at <= clock_timestamp\(\)/i
  );
});

test("batch delegates terminalization to canonical lifecycle helper", () => {
  assert.match(
    dbMigration,
    /cing_wallet_expire_stale_manual_pos_session_private_v1/i
  );
});

test("canonical helper holds per-POS advisory transaction fence", () => {
  assert.match(
    lifecycleMigration,
    /pg_advisory_xact_lock/i
  );
});

test("canonical helper fails closed on financial proof", () => {
  assert.match(
    lifecycleMigration,
    /customer_user_id is not null[\s\S]*wallet_transaction_id is not null[\s\S]*paid_at is not null[\s\S]*CING_WALLET_POS_EXPIRE_FINANCIAL_PROOF_PRESENT/i
  );
});

test("canonical helper records append-only SESSION_EXPIRED audit", () => {
  assert.match(
    lifecycleMigration,
    /SESSION_EXPIRED[\s\S]*intent_expired:/i
  );
});

test("reaper migration contains zero Wallet ledger or loyalty mutation authority", () => {
  assert.doesNotMatch(
    dbMigration,
    /insert\s+into\s+public\.cing_wallet_transactions/i
  );
  assert.doesNotMatch(
    dbMigration,
    /update\s+public\.cing_wallet_accounts/i
  );
  assert.doesNotMatch(
    dbMigration,
    /updateMemberPoint|addPoints|add_points|syncSingleUserSpending/i
  );
});

test("worker only calls batch lifecycle RPC", () => {
  assert.match(
    worker,
    /cing_wallet_expire_stale_manual_pos_sessions_batch_v1/
  );
  assert.doesNotMatch(
    worker,
    /cing_wallet_settle_pos_payment_atomic_v1|updateMemberPoint|addPoints|syncSingleUserSpending/
  );
});

test("worker is bounded and runs once per minute", () => {
  assert.match(worker, /BATCH_LIMIT = 50/);
  assert.match(worker, /INTERVAL_MS = 60 \* 1000/);
});

test("worker integrates with scheduler health authority", () => {
  assert.match(worker, /registerScheduler/);
  assert.match(worker, /markSchedulerStarted/);
  assert.match(worker, /markSchedulerSuccess/);
  assert.match(worker, /markSchedulerError/);
});

test("worker performs immediate boot repair and interval repair", () => {
  assert.match(
    worker,
    /execute\(\)\.catch\(\(\) => \{\}\)[\s\S]*setInterval/
  );
});

test("server boots the expired session reaper", () => {
  assert.match(
    server,
    /startCingWalletPosExpiredSessionReaperWorker/
  );
});

test("offline POS settlement service has no loyalty accrual calls", () => {
  assert.doesNotMatch(
    posPaymentService,
    /updateMemberPoint|\baddPoints\b|\badd_points\b|syncSingleUserSpending/
  );
});

test("reaper never depends on Event11 trust", () => {
  assert.doesNotMatch(
    worker + dbMigration,
    /CING_WALLET_POS_EVENT11_TRUST_ENABLED/
  );
});

test("worker uses canonical root Supabase service client", () => {
  assert.match(
    worker,
    /const supabase = require\("\.\.\/\.\.\/\.\.\/supabase"\);/
  );

  assert.doesNotMatch(
    worker,
    /config\/supabase|\{\s*supabase\s*\}\s*=\s*require/
  );
});

test("reaper bootstrap failure domain is independent from transaction integrity worker", () => {
  const txStart =
    server.indexOf("startTransactionIntegrityWorker();");

  const txCatch =
    server.indexOf(
      'console.warn("[TX INTEGRITY] worker start failed:"',
      txStart
    );

  const reaperStart =
    server.indexOf(
      "startCingWalletPosExpiredSessionReaperWorker();"
    );

  assert.ok(txStart >= 0);
  assert.ok(txCatch > txStart);
  assert.ok(reaperStart > txCatch);

  const reaperRegion =
    server.slice(txCatch, reaperStart + 200);

  assert.match(
    reaperRegion,
    /try\s*\{[\s\S]*startCingWalletPosExpiredSessionReaperWorker/
  );
});
