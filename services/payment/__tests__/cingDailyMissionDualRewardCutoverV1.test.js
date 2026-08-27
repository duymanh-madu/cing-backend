"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const mission =
  fs.readFileSync(
    "services/dailyMissionService.js",
    "utf8"
  );

const chess =
  fs.readFileSync(
    "routes/chessRoutes.js",
    "utf8"
  );

const admin =
  fs.readFileSync(
    "routes/adminMissionRoutes.js",
    "utf8"
  );

test(
  "daily mission mutation delegates exclusively to PostgreSQL authority",
  () => {
    assert.match(
      mission,
      /complete_daily_mission_atomic/
    );

    assert.doesNotMatch(
      mission,
      /\.from\(\s*["']players["']\s*\)[\s\S]*\.update/
    );

    assert.doesNotMatch(
      mission,
      /awardPlays/
    );
  }
);

test(
  "daily mission supports independent plays and points rewards",
  () => {
    assert.match(
      mission,
      /p_plays:[\s\S]*plays/
    );

    assert.match(
      mission,
      /p_points:[\s\S]*points/
    );

    assert.match(
      mission,
      /plays_awarded/
    );

    assert.match(
      mission,
      /points_awarded/
    );
  }
);

test(
  "daily mission never mutates or references Wallet",
  () => {
    assert.doesNotMatch(
      mission,
      /cing_wallet|wallet_accounts|wallet_transactions|wallet_topup/i
    );

    assert.doesNotMatch(
      admin,
      /cing_wallet|wallet_accounts|wallet_transactions|wallet_topup/i
    );
  }
);

test(
  "checkin and order missions use one atomic completion authority",
  () => {
    assert.match(
      mission,
      /async function doCheckin[\s\S]*completeMissionReward/
    );

    assert.match(
      mission,
      /async function checkOrderMissions[\s\S]*completeMissionReward/
    );
  }
);

test(
  "chess manual win mission uses shared daily mission authority",
  () => {
    assert.match(
      chess,
      /completeManualMission/
    );

    assert.doesNotMatch(
      chess,
      /await awardPlays\(/
    );

    const winRegionStart =
      chess.indexOf(
        "const winCfg"
      );

    assert.ok(
      winRegionStart >= 0
    );

    const winRegion =
      chess.slice(
        winRegionStart,
        chess.indexOf(
          "// Check daily challenge",
          winRegionStart
        )
      );

    assert.doesNotMatch(
      winRegion,
      /\.from\(\s*["']daily_missions["']\s*\).*upsert/s
    );
  }
);

test(
  "admin allows plays-only points-only or both but rejects empty reward",
  () => {
    assert.doesNotMatch(
      admin,
      /Number\(plays\)\s*\|\|\s*1/
    );

    assert.match(
      admin,
      /normalizedPlays === 0[\s\S]*normalizedPoints === 0/
    );

    assert.match(
      admin,
      /parseNonNegativeInteger\([\s\S]*plays/
    );

    assert.match(
      admin,
      /parseNonNegativeInteger\([\s\S]*points/
    );
  }
);

test(
  "mission realtime event exposes both reward resources",
  () => {
    assert.match(
      mission,
      /event:[\s\S]*"mission\.completed"[\s\S]*plays_awarded[\s\S]*points_awarded/
    );
  }
);

test(
  "legacy awardPlays API has no remaining production consumer",
  () => {
    const challenge =
      fs.readFileSync(
        "services/dailyChallengeService.js",
        "utf8"
      );

    assert.doesNotMatch(
      challenge,
      /\bawardPlays\b/
    );

    assert.doesNotMatch(
      mission,
      /\bawardPlays\b/
    );

    assert.doesNotMatch(
      chess,
      /\bawardPlays\b/
    );
  }
);
