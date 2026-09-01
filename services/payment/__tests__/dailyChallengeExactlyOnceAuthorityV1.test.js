const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const migration =
  fs.readFileSync(
    "db/migrations/20260901_daily_challenge_exactly_once_authority_v1.sql",
    "utf8"
  );


const service =
  fs.readFileSync(
    "services/dailyChallengeService.js",
    "utf8"
  );


const worker =
  fs.readFileSync(
    "services/rewards/dailyChallengeIposSyncWorker.js",
    "utf8"
  );


const server =
  fs.readFileSync(
    "server.js",
    "utf8"
  );


test(
  "one challenge exists per date and game",
  () => {
    assert.match(
      migration,
      /create unique index if not exists[\s\S]*daily_challenges_date_game_uq[\s\S]*challenge_date[\s\S]*game_key/i
    );
  }
);


test(
  "challenge ledger has first-class unique identity",
  () => {
    assert.match(
      migration,
      /daily_challenge_id uuid/i
    );

    assert.match(
      migration,
      /point_transactions_daily_challenge_add_uq[\s\S]*daily_challenge_id[\s\S]*transaction_type = 'add'/i
    );
  }
);


test(
  "completion balance ledger and iPOS intent are one DB transaction",
  () => {
    assert.match(
      migration,
      /complete_daily_challenge_atomic/i
    );

    assert.match(
      migration,
      /from public\.daily_challenges[\s\S]*for update/i
    );

    assert.match(
      migration,
      /from public\.players[\s\S]*for update/i
    );

    assert.match(
      migration,
      /update public\.players[\s\S]*update public\.daily_challenges[\s\S]*ipos_sync_status[\s\S]*'pending'[\s\S]*insert into public\.point_transactions/i
    );
  }
);


test(
  "completed replay exits before financial mutation",
  () => {
    assert.match(
      migration,
      /v_challenge\.completed[\s\S]*return query[\s\S]*false/i
    );
  }
);


test(
  "historical challenges are not queued for iPOS delivery",
  () => {
    assert.doesNotMatch(
      migration,
      /update\s+public\.daily_challenges[\s\S]*ipos_sync_status\s*=\s*'pending'[\s\S]*where[\s\S]*completed\s*=\s*true/i
    );
  }
);


test(
  "generic addPoints is removed from daily challenge service",
  () => {
    assert.doesNotMatch(
      service,
      /\baddPoints\b/
    );

    assert.match(
      service,
      /complete_daily_challenge_atomic/
    );
  }
);


test(
  "non-applied concurrent claimant exits before notification",
  () => {
    const guard =
      service.indexOf(
        "if (!atomicResult?.applied)"
      );

    const broadcast =
      service.indexOf(
        "// Broadcast toan server"
      );

    assert.ok(
      guard >= 0
    );

    assert.ok(
      broadcast > guard
    );
  }
);


test(
  "challenge creation handles DB unique race",
  () => {
    assert.match(
      service,
      /createError\?\.code === "23505"/
    );
  }
);


test(
  "authority is service-role only",
  () => {
    assert.match(
      migration,
      /revoke all[\s\S]*from public, anon, authenticated/i
    );

    assert.match(
      migration,
      /grant execute[\s\S]*to service_role/i
    );
  }
);


test(
  "worker uses immutable challenge id marker",
  () => {
    assert.match(
      worker,
      /CING-DAILY-CHALLENGE-\$\{challengeId\}/
    );
  }
);


test(
  "worker verifies iPOS before and after ADD",
  () => {
    assert.match(
      worker,
      /const existingIposLog[\s\S]*await findChallengeMarker\([\s\S]*if\s*\([\s\S]*!existingIposLog\.found[\s\S]*await updateMemberPoint\([\s\S]*const verifiedIposLog[\s\S]*await findChallengeMarker\(/
    );
  }
);


test(
  "worker performs paginated marker lookup",
  () => {
    assert.match(
      worker,
      /MAX_PAGES\s*=\s*100/
    );

    assert.match(
      worker,
      /scannedCount\s*<\s*100/
    );

    assert.match(
      worker,
      /findMembershipLogByNote/
    );
  }
);


test(
  "worker has durable retry and stale recovery",
  () => {
    assert.match(
      worker,
      /releaseStuckChallenges/
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
  "worker Redis lock is ownership fenced",
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
      /redis\.call\("GET", KEYS\[1\]\)[\s\S]*ARGV\[1\][\s\S]*redis\.call\("DEL"/
    );
  }
);


test(
  "daily challenge worker is independently bootstrapped",
  () => {
    assert.match(
      server,
      /DAILY CHALLENGE IPOS SYNC WORKER[\s\S]*startDailyChallengeIposSyncWorker[\s\S]*\[DAILY CHALLENGE IPOS SYNC\]/
    );
  }
);
