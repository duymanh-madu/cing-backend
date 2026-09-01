const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const migration =
  fs.readFileSync(
    "db/migrations/" +
    "20260901_leaderboard_exactly_once_issuance_v1.sql",
    "utf8"
  );

const service =
  fs.readFileSync(
    "services/leaderboardResetService.js",
    "utf8"
  );

const admin =
  fs.readFileSync(
    "routes/adminLeaderboardRoutes.js",
    "utf8"
  );

test(
  "leaderboard issuance has durable period run uniqueness",
  () => {
    assert.match(
      migration,
      /UNIQUE\s*\(\s*run_type\s*,\s*period_key\s*\)/i
    );

    assert.match(
      migration,
      /pg_advisory_xact_lock/i
    );
  }
);

test(
  "new rewards have DB unique issuance identity",
  () => {
    assert.match(
      migration,
      /reward_issuance_key/i
    );

    assert.match(
      migration,
      /CREATE UNIQUE INDEX[\s\S]*reward_issuance/i
    );

    assert.match(
      migration,
      /WHERE reward_issuance_key IS NOT NULL/i
    );
  }
);

test(
  "historical rewards are not backfilled",
  () => {
    assert.doesNotMatch(
      migration,
      /UPDATE public\.pending_rewards[\s\S]*reward_issuance_key\s*=/i
    );
  }
);

test(
  "weekly winner issuance and spending reset are one DB transaction",
  () => {
    assert.match(
      migration,
      /issue_weekly_leaderboard_rewards_atomic/i
    );

    assert.match(
      migration,
      /INSERT INTO public\.pending_rewards[\s\S]*UPDATE public\.players[\s\S]*crm_spend_weekly\s*=\s*0[\s\S]*last_weekly_reset/i
    );
  }
);

test(
  "monthly and yearly spending issuance use same DB authority",
  () => {
    assert.match(
      migration,
      /issue_spending_leaderboard_rewards_atomic/i
    );

    assert.match(
      migration,
      /p_run_type NOT IN\s*\(\s*'monthly'\s*,\s*'yearly'/i
    );
  }
);

test(
  "application reset service calls DB authority",
  () => {
    assert.match(
      service,
      /issue_weekly_leaderboard_rewards_atomic/
    );

    assert.match(
      service,
      /issue_spending_leaderboard_rewards_atomic/
    );
  }
);

test(
  "manual weekly no longer nulls reset marker",
  () => {
    assert.doesNotMatch(
      admin,
      /last_weekly_reset\s*:\s*null/
    );

    assert.doesNotMatch(
      admin,
      /update\(\{\s*last_weekly_reset\s*:\s*null/
    );
  }
);

test(
  "admin leaderboard cannot directly add points",
  () => {
    assert.doesNotMatch(
      admin,
      /\baddPoints\b/
    );

    assert.match(
      admin,
      /DIRECT_LEADERBOARD_REWARD_DISTRIBUTION_DISABLED/
    );
  }
);

test(
  "manual weekly and monthly use shared reset service",
  () => {
    assert.match(
      admin,
      /manualWeeklyReset/
    );

    assert.match(
      admin,
      /manualMonthlyReset/
    );
  }
);

test(
  "DB issuance functions are service-role only",
  () => {
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/i
    );

    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/i
    );
  }
);

test(
  "reset service has exactly one manual monthly authority",
  () => {
    const matches =
      service.match(
        /async function manualMonthlyReset\s*\(/g
      ) || [];

    assert.equal(
      matches.length,
      1
    );
  }
);

test(
  "reset service has no direct pending reward issuance",
  () => {
    assert.doesNotMatch(
      service,
      /\.from\(['"]pending_rewards['"]\)[\s\S]{0,160}\.insert\(/
    );
  }
);

test(
  "reset service has no application-side spending counter reset",
  () => {
    assert.doesNotMatch(
      service,
      /\.update\(\{[\s\S]{0,100}crm_spend_(weekly|monthly|yearly)\s*:\s*0/
    );
  }
);

test(
  "weekly top1 helper remains defined after reset refactor",
  () => {
    assert.match(
      service,
      /function getLastMonday\s*\(\)/
    );

    assert.match(
      service,
      /query\s*=\s*query\.gte\(['"]played_at['"],\s*getLastMonday\(\)\)/
    );
  }
);

test(
  "weekly authority refuses replay of legacy completed period",
  () => {
    assert.match(
      migration,
      /last_weekly_reset[\s\S]*v_last_reset[\s\S]*v_last_reset\s*>=\s*p_period_end[\s\S]*legacy_reset_marker/
    );
  }
);

test(
  "monthly and yearly authority refuse legacy completed period replay",
  () => {
    assert.match(
      migration,
      /last_monthly_reset[\s\S]*last_yearly_reset[\s\S]*v_last_reset\s*>=\s*p_period_end[\s\S]*legacy_reset_marker/
    );
  }
);

test(
  "weekly period key uses Vietnam Monday calendar date",
  () => {
    assert.match(
      service,
      /previousMondayVN\.getFullYear\(\)[\s\S]*previousMondayVN\.getMonth\(\)[\s\S]*previousMondayVN\.getDate\(\)/
    );

    assert.doesNotMatch(
      service,
      /const periodKey\s*=\s*startUtc[\s\S]{0,80}\.slice\(0,\s*10\)/
    );
  }
);
