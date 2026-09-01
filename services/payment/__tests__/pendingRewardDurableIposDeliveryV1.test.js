const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root =
  path.resolve(__dirname, "../../..");

const migration =
  fs.readFileSync(
    path.join(
      root,
      "db/migrations/" +
      "20260901_pending_reward_durable_ipos_delivery_v1.sql"
    ),
    "utf8"
  );

const route =
  fs.readFileSync(
    path.join(
      root,
      "routes/gameRewardsRoutes.js"
    ),
    "utf8"
  );

const worker =
  fs.readFileSync(
    path.join(
      root,
      "services/rewards/" +
      "pendingRewardIposSyncWorker.js"
    ),
    "utf8"
  );

const server =
  fs.readFileSync(
    path.join(root, "server.js"),
    "utf8"
  );

test(
  "claim locks pending reward and player",
  () => {
    assert.match(
      migration,
      /from public\.pending_rewards[\s\S]*for update/i
    );

    assert.match(
      migration,
      /from public\.players[\s\S]*for update/i
    );
  }
);

test(
  "ordinary reward claim persists durable iPOS intent",
  () => {
    assert.match(
      migration,
      /campaign_claim_id is null[\s\S]*'pending'/i
    );

    assert.match(
      migration,
      /update public\.pending_rewards[\s\S]*claimed = true[\s\S]*ipos_sync_status/i
    );
  }
);

test(
  "campaign reward keeps campaign delivery authority",
  () => {
    assert.match(
      migration,
      /if v_reward\.campaign_claim_id is not null[\s\S]*update public\.campaign_reward_claims/i
    );
  }
);

test(
  "HTTP claim route never calls iPOS directly",
  () => {
    assert.doesNotMatch(
      route,
      /updateMemberPoint/
    );

    assert.match(
      route,
      /claim_pending_reward_atomic/
    );
  }
);

test(
  "worker uses immutable reward id as iPOS marker",
  () => {
    assert.match(
      worker,
      /CING-REWARD-\$\{rewardId\}/
    );
  }
);

test(
  "worker verifies iPOS before and after ADD",
  () => {
    /*
     * Financial preflight/postflight goes through
     * findRewardMarker(), which owns paginated lookup via
     * findMembershipLogByNote().
     */
    assert.match(
      worker,
      /const existingIposLog\s*=[\s\S]*await findRewardMarker\([\s\S]*if \(!existingIposLog\.found\)[\s\S]*await updateMemberPoint\([\s\S]*const verifiedIposLog\s*=[\s\S]*await findRewardMarker\(/
    );

    assert.match(
      worker,
      /async function findRewardMarker\([\s\S]*findMembershipLogByNote\(/
    );
  }
);

test(
  "worker has retry and stale processing recovery",
  () => {
    assert.match(
      worker,
      /releaseStuckRewards/
    );

    assert.match(
      worker,
      /MAX_RETRIES/
    );

    assert.match(
      worker,
      /ipos_locked_until/
    );

    assert.match(
      worker,
      /nextRetryIso/
    );
  }
);

test(
  "worker is bootstrapped by server",
  () => {
    assert.match(
      server,
      /startPendingRewardIposSyncWorker/
    );
  }
);

test(
  "membership-log helper exposes pagination metadata",
  () => {
    const foodbook =
      fs.readFileSync(
        path.join(
          root,
          "services/foodbook.js"
        ),
        "utf8"
      );

    assert.match(
      foodbook,
      /scanned_count:\s*list\.length/
    );
  }
);

test(
  "reward worker scans membership log beyond page one",
  () => {
    assert.match(
      worker,
      /MAX_PAGES\s*=\s*100/
    );

    assert.match(
      worker,
      /for\s*\([\s\S]*page\s*=\s*1[\s\S]*page\s*<=\s*MAX_PAGES/
    );

    assert.match(
      worker,
      /scannedCount\s*<\s*100/
    );

    assert.match(
      worker,
      /findRewardMarker[\s\S]*findMembershipLogByNote/
    );
  }
);

test(
  "Redis worker lock is ownership fenced",
  () => {
    assert.match(
      worker,
      /randomUUID/
    );

    assert.match(
      worker,
      /redisLockToken/
    );

    assert.match(
      worker,
      /redisLockOwned/
    );

    assert.match(
      worker,
      /redis\.call\("GET", KEYS\[1\]\)[\s\S]*ARGV\[1\][\s\S]*redis\.call\("DEL"/
    );
  }
);

test(
  "pending reward worker has independent bootstrap failure domain",
  () => {
    assert.match(
      server,
      /\[CAMPAIGN IPOS SYNC\][\s\S]*PENDING REWARD IPOS SYNC WORKER[\s\S]*\[PENDING REWARD IPOS SYNC\]/
    );
  }
);
