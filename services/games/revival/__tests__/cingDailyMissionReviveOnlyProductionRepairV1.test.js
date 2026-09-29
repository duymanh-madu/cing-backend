"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root =
  path.resolve(__dirname, "../../../..");

const service =
  fs.readFileSync(
    path.join(
      root,
      "services/dailyMissionService.js"
    ),
    "utf8"
  );

const admin =
  fs.readFileSync(
    path.join(
      root,
      "routes/adminMissionRoutes.js"
    ),
    "utf8"
  );

assert.match(
  service,
  /completeDailyMissionReviveV2/
);

assert.match(
  service,
  /revive_credits:\s*plays/
);

assert.match(
  service,
  /reward_currency:\s*"revive_credit"/
);

assert.doesNotMatch(
  service,
  /complete_daily_mission_atomic/
);

assert.doesNotMatch(
  service,
  /CING_DAILY_MISSION_REVIVE_V2_ENABLED/
);

assert.doesNotMatch(
  service,
  /legacy_game_play/
);

assert.match(
  admin,
  /revive_credits\s*\?\?\s*plays/
);

assert.match(
  admin,
  /Nhiệm vụ phải thưởng ít nhất Revive Credit hoặc điểm tích luỹ/
);

assert.match(
  admin,
  /revive_credits:\s*Number\(row\.plays \|\| 0\)/
);

console.log(
  "PASS: backend Daily Mission active authority is Revive Credit-only"
);
