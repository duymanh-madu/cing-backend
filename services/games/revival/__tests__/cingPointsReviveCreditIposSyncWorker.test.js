"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const source =
  fs.readFileSync(
    path.resolve(
      __dirname,
      "../cingPointsReviveCreditIposSyncWorker.js"
    ),
    "utf8"
  );

test(
  "worker is explicitly disabled by default",
  () => {
    assert.match(
      source,
      /process\.env\[ENABLE_FLAG\]\s*!==\s*"true"/
    );

    assert.doesNotMatch(
      source,
      /\bsetInterval\s*\(/
    );

    assert.doesNotMatch(
      source,
      /\bsetTimeout\s*\(/
    );
  }
);

test(
  "new purchase source owns distinct queue and marker",
  () => {
    assert.match(
      source,
      /cing_points_revive_credit_purchases/
    );

    assert.match(
      source,
      /CING-REVIVE-POINTS-\$\{id\}/
    );

    assert.match(
      source,
      /cing:revive:points:ipos-sync:lock/
    );
  }
);

test(
  "iPOS history lookup uses bounded pagination",
  () => {
    assert.match(
      source,
      /MAX_PAGES\s*=\s*100/
    );

    assert.match(
      source,
      /PAGE_SIZE\s*=\s*100/
    );

    assert.match(
      source,
      /page <= MAX_PAGES/
    );

    assert.match(
      source,
      /membership_log_pagination_limit_exceeded/
    );
  }
);

test(
  "external MINUS requires preflight and postflight",
  () => {
    const preflight =
      source.indexOf(
        "const preflight ="
      );

    const minus =
      source.indexOf(
        "await updateMemberPoint({"
      );

    const postflight =
      source.indexOf(
        "const postflight ="
      );

    const synced =
      source.indexOf(
        "await markSynced("
      );

    assert.ok(
      preflight >= 0
    );

    assert.ok(
      minus > preflight
    );

    assert.ok(
      postflight > minus
    );

    assert.ok(
      synced > postflight
    );
  }
);

test(
  "point amount belongs to durable purchase receipt",
  () => {
    assert.match(
      source,
      /pointsOf\(\s*row\.total_points\s*\)/
    );

    assert.match(
      source,
      /type_change:\s*"MINUS"/
    );

    assert.match(
      source,
      /point_change:\s*points/
    );
  }
);

test(
  "Redis lock uses ownership token and CAS release",
  () => {
    assert.match(
      source,
      /randomUUID\(\)/
    );

    assert.match(
      source,
      /"NX",\s*"EX",\s*LOCK_TTL_SECONDS/
    );

    assert.match(
      source,
      /redis\.call\("GET", KEYS\[1\]\) == ARGV\[1\]/
    );
  }
);

test(
  "processing lease and terminal failure are durable",
  () => {
    assert.match(
      source,
      /ipos_locked_until/
    );

    assert.match(
      source,
      /MAX_RETRIES\s*=\s*6/
    );

    assert.match(
      source,
      /firstAttempt\(/
    );

    assert.match(
      source,
      /sendAdminAlert/
    );
  }
);

test(
  "worker is wired into explicitly gated backend bootstrap",
  () => {
    const server =
      fs.readFileSync(
        path.resolve(
          __dirname,
          "../../../..",
          "server.js"
        ),
        "utf8"
      );

    assert.match(server, /CING_POINTS_REVIVE_IPOS_SYNC_WORKER_ENABLED === "true"/);
    assert.match(server, /startCingPointsReviveIposSyncWorker/);

    assert.doesNotMatch(
      server,
      /processCingPointsReviveIposSyncQueue/
    );
  }
);
