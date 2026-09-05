"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const migration =
  fs.readFileSync(
    "db/migrations/20260905_daily_mission_history_projection_v1.sql",
    "utf8"
  );


test(
  "Daily Mission history derives from authoritative ledgers",
  () => {
    assert.match(
      migration,
      /after insert[\s\S]*public\.game_play_transactions/i
    );

    assert.match(
      migration,
      /after insert[\s\S]*public\.point_transactions/i
    );
  }
);


test(
  "game play rewards project plays_added with authoritative balance",
  () => {
    assert.match(
      migration,
      /'plays_added'[\s\S]*'amount'[\s\S]*new\.amount[\s\S]*'new_total'[\s\S]*new\.balance_after/i
    );

    assert.match(
      migration,
      /new\.reference_type[\s\S]*'daily_mission'/i
    );
  }
);


test(
  "point rewards project points_added with authoritative balance",
  () => {
    assert.match(
      migration,
      /'points_added'[\s\S]*'amount'[\s\S]*new\.points[\s\S]*'new_total'[\s\S]*new\.balance_after/i
    );

    assert.match(
      migration,
      /new\.mission_id is null/i
    );
  }
);


test(
  "projection identity is unique by event type and mission",
  () => {
    assert.match(
      migration,
      /create unique index if not exists[\s\S]*analytics_events_daily_mission_reward_projection_uq/i
    );

    assert.match(
      migration,
      /event_name[\s\S]*metadata ->> 'reference_type'[\s\S]*metadata ->> 'reference_id'/i
    );
  }
);


test(
  "historical backfill writes only compatibility history",
  () => {
    const backfillStart =
      migration.indexOf(
        "Historical game-play projection backfill"
      );

    assert.ok(
      backfillStart >= 0
    );

    const backfill =
      migration.slice(
        backfillStart
      );

    assert.match(
      backfill,
      /insert into[\s\S]*public\.analytics_events/i
    );

    assert.doesNotMatch(
      backfill,
      /update\s+public\.players/i
    );

    assert.doesNotMatch(
      backfill,
      /insert into\s+public\.game_play_transactions/i
    );

    assert.doesNotMatch(
      backfill,
      /insert into\s+public\.point_transactions/i
    );
  }
);


test(
  "backfill preserves original ledger timestamps",
  () => {
    assert.match(
      migration,
      /gt\.created_at[\s\S]*from[\s\S]*public\.game_play_transactions/i
    );

    assert.match(
      migration,
      /pt\.created_at[\s\S]*from[\s\S]*public\.point_transactions/i
    );
  }
);


test(
  "trigger projection failures remain atomic with ledger insert",
  () => {
    assert.match(
      migration,
      /create trigger[\s\S]*after insert[\s\S]*execute function/i
    );

    assert.doesNotMatch(
      migration,
      /exception[\s\S]*when others[\s\S]*null/i
    );
  }
);


test(
  "projection functions are security definer with fixed search path",
  () => {
    const occurrences =
      migration.match(
        /security definer[\s\S]{0,120}set search_path = public/gi
      ) || [];

    assert.equal(
      occurrences.length,
      2
    );
  }
);


test(
  "Daily Mission authority itself is not reconstructed",
  () => {
    assert.doesNotMatch(
      migration,
      /create or replace function\s+public\.complete_daily_mission_atomic/i
    );

    assert.doesNotMatch(
      migration,
      /update\s+public\.players/i
    );
  }
);


test(
  "migration verifies no missing projection after backfill",
  () => {
    assert.match(
      migration,
      /DAILY_MISSION_PLAY_HISTORY_BACKFILL_INCOMPLETE/
    );

    assert.match(
      migration,
      /DAILY_MISSION_POINT_HISTORY_BACKFILL_INCOMPLETE/
    );

    assert.match(
      migration,
      /DAILY_MISSION_PLAY_HISTORY_DUPLICATE/
    );

    assert.match(
      migration,
      /DAILY_MISSION_POINT_HISTORY_DUPLICATE/
    );
  }
);


test(
  "migration is one PostgreSQL transaction",
  () => {
    assert.equal(
      (
        migration.match(
          /^\s*begin;\s*$/gim
        ) || []
      ).length,
      1
    );

    assert.equal(
      (
        migration.match(
          /^\s*commit;\s*$/gim
        ) || []
      ).length,
      1
    );
  }
);
