const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../..");

const workerPath = path.join(
  ROOT,
  "services/campaign/nationalDayRewardIposSyncWorker.js"
);

const routePath = path.join(
  ROOT,
  "routes/gameRewardsRoutes.js"
);

const worker = fs.readFileSync(workerPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");

function count(pattern, source = worker) {
  return [...source.matchAll(pattern)].length;
}

test(
  "National Day fast path exposes one exact-claim processor",
  () => {
    assert.match(
      worker,
      /async function processNationalDayRewardIposClaim\(\s*claimId\s*\)/
    );

    assert.match(
      worker,
      /module\.exports\s*=\s*\{[\s\S]*processNationalDayRewardIposClaim,[\s\S]*processNationalDayRewardIposSyncQueue,[\s\S]*startNationalDayRewardIposSyncWorker/
    );

    assert.equal(
      count(
        /async function processNationalDayRewardIposClaim\(/g
      ),
      1
    );
  }
);

test(
  "exact claim acquisition is fenced pending to processing",
  () => {
    assert.match(
      worker,
      /async function claimPendingClaimById\(claimId\)[\s\S]*\.eq\("id", claimId\)[\s\S]*\.eq\("reward_code", "national_day_2026_login_29"\)[\s\S]*\.eq\("ipos_sync_status", "pending"\)[\s\S]*\.lte\("ipos_next_retry_at", eligibleAt\)[\s\S]*\.select\("\*"\)/
    );

    assert.match(
      worker,
      /async function claimPendingClaimById\(claimId\)[\s\S]*ipos_sync_status: "processing"/
    );

    assert.match(
      worker,
      /async function processNationalDayRewardIposClaim\([\s\S]*await claimPendingClaimById\(claimId\)[\s\S]*if \(!claim\)[\s\S]*reason: "claim_not_pending"[\s\S]*return deliverClaimToIpos\(claim\)/
    );
  }
);

test(
  "batch scheduler reuses exact-claim acquisition and shared delivery",
  () => {
    assert.match(
      worker,
      /async function claimPendingClaims\([\s\S]*await claimPendingClaimById\(row\.id\)/
    );

    assert.match(
      worker,
      /for \(const claim of claims\)[\s\S]*await deliverClaimToIpos\(claim\)/
    );

    assert.equal(
      count(/async function deliverClaimToIpos\(/g),
      1
    );
  }
);

test(
  "there is exactly one iPOS ADD implementation",
  () => {
    assert.equal(
      count(/updateMemberPoint\(\{/g),
      1
    );

    assert.match(
      worker,
      /updateMemberPoint\(\{[\s\S]*type_change: "ADD"[\s\S]*point_change:[\s\S]*Number\(claim\.reward_amount \|\| 0\)[\s\S]*note: iposNote/
    );
  }
);

test(
  "immutable claim marker remains the iPOS idempotency marker",
  () => {
    assert.equal(
      count(
        /return `CING-ND2026-\$\{claimId\}`/g
      ),
      1
    );

    assert.match(
      worker,
      /const iposNote\s*=\s*buildIposRewardNote\(claim\.id\)/
    );

    assert.equal(
      count(/await findNationalDayRewardMarker\(/g),
      2
    );
  }
);

test(
  "delivery keeps preflight ADD postflight ordering",
  () => {
    const deliveryStart = worker.indexOf(
      "async function deliverClaimToIpos"
    );

    const deliveryEnd = worker.indexOf(
      "async function processNationalDayRewardIposClaim",
      deliveryStart
    );

    assert.ok(deliveryStart >= 0);
    assert.ok(deliveryEnd > deliveryStart);

    const delivery = worker.slice(
      deliveryStart,
      deliveryEnd
    );

    const firstLookup =
      delivery.indexOf("findNationalDayRewardMarker(");

    const add =
      delivery.indexOf("updateMemberPoint({");

    const secondLookup =
      delivery.indexOf(
        "findNationalDayRewardMarker(",
        firstLookup + 1
      );

    const synced =
      delivery.indexOf("await markSynced(claim)");

    assert.ok(firstLookup >= 0);
    assert.ok(add > firstLookup);
    assert.ok(secondLookup > add);
    assert.ok(synced > secondLookup);
  }
);

test(
  "success and retry transitions are fenced from processing",
  () => {
    const markSyncedStart =
      worker.indexOf("async function markSynced");

    const markFailedStart =
      worker.indexOf(
        "async function markFailedAttempt"
      );

    const deliveryStart =
      worker.indexOf(
        "async function deliverClaimToIpos"
      );

    assert.ok(markSyncedStart >= 0);
    assert.ok(markFailedStart > markSyncedStart);
    assert.ok(deliveryStart > markFailedStart);

    const markSynced = worker.slice(
      markSyncedStart,
      markFailedStart
    );

    const markFailed = worker.slice(
      markFailedStart,
      deliveryStart
    );

    assert.match(
      markSynced,
      /\.eq\("id", claim\.id\)[\s\S]*\.eq\("ipos_sync_status", "processing"\)/
    );

    assert.match(
      markFailed,
      /\.eq\("id", claim\.id\)[\s\S]*\.eq\("ipos_sync_status", "processing"\)/
    );
  }
);

test(
  "failed immediate delivery remains durable retry authority",
  () => {
    assert.match(
      worker,
      /catch \(error\)[\s\S]*await markFailedAttempt\([\s\S]*claim,[\s\S]*error\.message[\s\S]*\)[\s\S]*success: false/
    );

    assert.match(
      worker,
      /const status\s*=\s*terminal \? "failed" : "pending"/
    );

    assert.match(
      worker,
      /ipos_next_retry_at:[\s\S]*nextRetryIso\(retryCount\)/
    );
  }
);

test(
  "scheduled recovery worker remains enabled",
  () => {
    assert.match(
      worker,
      /function startNationalDayRewardIposSyncWorker\(\)/
    );

    assert.match(
      worker,
      /setInterval\(\(\) => \{[\s\S]*processNationalDayRewardIposSyncQueue\(\)/
    );

    assert.match(
      worker,
      /NATIONAL_DAY_REWARD_IPOS_SYNC_INTERVAL_MS[\s\S]*5 \* 60 \* 1000/
    );
  }
);

test(
  "claim route has not yet acquired a direct iPOS mutation path",
  () => {
    assert.doesNotMatch(
      route,
      /updateMemberPoint\s*\(/
    );

    assert.doesNotMatch(
      route,
      /findMembershipLogByNote\s*\(/
    );
  }
);

test(
  "claim route dispatches exact campaign claim after atomic RPC",
  () => {
    assert.match(
      route,
      /claim_pending_reward_atomic[\s\S]*const result\s*=[\s\S]*if \([\s\S]*!result\.already_claimed[\s\S]*result\.campaign_claim_id[\s\S]*setImmediate\(\(\) => \{[\s\S]*processNationalDayRewardIposClaim\([\s\S]*campaignClaimId[\s\S]*\)/
    );
  }
);

test(
  "route fast path is campaign-only and first-claim-only",
  () => {
    assert.match(
      route,
      /if \(\s*!result\.already_claimed\s*&&\s*result\.campaign_claim_id\s*\)/
    );

    assert.match(
      route,
      /const campaignClaimId\s*=\s*result\.campaign_claim_id/
    );
  }
);

test(
  "route fast path is best effort and never awaited by customer claim",
  () => {
    assert.match(
      route,
      /setImmediate\(\(\) => \{[\s\S]*processNationalDayRewardIposClaim\([\s\S]*\.catch\(error => \{/
    );

    assert.doesNotMatch(
      route,
      /await\s+processNationalDayRewardIposClaim\s*\(/
    );
  }
);

test(
  "HTTP route still contains no direct iPOS point mutation",
  () => {
    assert.doesNotMatch(
      route,
      /updateMemberPoint\s*\(/
    );

    assert.doesNotMatch(
      route,
      /findMembershipLogByNote\s*\(/
    );
  }
);

test(
  "National Day marker lookup scans beyond membership-log page one",
  () => {
    assert.match(
      worker,
      /async function findNationalDayRewardMarker\([\s\S]*const MAX_PAGES = 100[\s\S]*let page = 1;[\s\S]*page <= MAX_PAGES;[\s\S]*page\+\+[\s\S]*findMembershipLogByNote\([\s\S]*nationalDayLookupWindow\(page\)/
    );

    assert.match(
      worker,
      /const scannedCount\s*=[\s\S]*Number\(result\.scanned_count \|\| 0\)[\s\S]*if \(scannedCount < 100\)/
    );

    assert.match(
      worker,
      /membership_log_pagination_limit_exceeded/
    );
  }
);

test(
  "National Day preflight and postflight share paginated marker authority",
  () => {
    const calls =
      worker.match(
        /await findNationalDayRewardMarker\(/g
      ) || [];

    assert.equal(
      calls.length,
      2
    );

    assert.match(
      worker,
      /const existingIposLog\s*=[\s\S]*await findNationalDayRewardMarker\([\s\S]*if \(!existingIposLog\.found\)[\s\S]*await updateMemberPoint\([\s\S]*const verifiedIposLog\s*=[\s\S]*await findNationalDayRewardMarker\(/
    );
  }
);

test(
  "National Day delivery has no direct page-one-only marker lookup",
  () => {
    const deliveryStart =
      worker.indexOf(
        "async function deliverClaimToIpos"
      );

    const processorStart =
      worker.indexOf(
        "async function processNationalDayRewardIposClaim"
      );

    assert.ok(deliveryStart >= 0);
    assert.ok(processorStart > deliveryStart);

    const delivery =
      worker.slice(
        deliveryStart,
        processorStart
      );

    assert.doesNotMatch(
      delivery,
      /findMembershipLogByNote/
    );

    assert.doesNotMatch(
      delivery,
      /page:\s*1/
    );
  }
);

test(
  "National Day marker lookup remains valid after campaign end",
  () => {
    assert.match(
      worker,
      /create_from:\s*"2026-08-15 00:00:00"/
    );

    assert.match(
      worker,
      /create_to:\s*"2030-01-01 00:00:00"/
    );

    assert.doesNotMatch(
      worker,
      /create_to:\s*"2026-10-01 00:00:00"/
    );
  }
);

test(
  "National Day processing completion is fenced by exact lease generation",
  () => {
    const syncedStart =
      worker.indexOf("async function markSynced");

    const failedStart =
      worker.indexOf(
        "async function markFailedAttempt",
        syncedStart
      );

    const deliveryStart =
      worker.indexOf(
        "async function deliverClaimToIpos",
        failedStart
      );

    assert.ok(syncedStart >= 0);
    assert.ok(failedStart > syncedStart);
    assert.ok(deliveryStart > failedStart);

    const synced =
      worker.slice(syncedStart, failedStart);

    const failed =
      worker.slice(failedStart, deliveryStart);

    for (const transition of [synced, failed]) {
      assert.match(
        transition,
        /\.eq\("ipos_sync_status",\s*"processing"\)/
      );

      assert.match(
        transition,
        /\.eq\("ipos_locked_until",\s*claim\.ipos_locked_until\)/
      );
    }
  }
);

test(
  "National Day scheduler Redis lock is ownership fenced",
  () => {
    assert.match(
      worker,
      /const\s+\{\s*randomUUID\s*\}\s*=\s*require\("crypto"\)/
    );

    assert.match(
      worker,
      /const redisLockToken\s*=\s*randomUUID\(\)/
    );

    assert.match(
      worker,
      /\.set\(\s*redisLockKey,\s*redisLockToken,\s*"NX",\s*"EX",\s*240\s*\)/
    );

    assert.match(
      worker,
      /redis\.call\('get', KEYS\[1\]\) == ARGV\[1\]/
    );

    assert.match(
      worker,
      /redis\.call\('del', KEYS\[1\]\)/
    );

    assert.doesNotMatch(
      worker,
      /\.set\(\s*redisLockKey,\s*"1",\s*"NX"/
    );

    assert.doesNotMatch(
      worker,
      /\.del\(redisLockKey\)/
    );
  }
);
