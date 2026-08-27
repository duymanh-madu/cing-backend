"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const migration =
  fs.readFileSync(
    "db/migrations/20260827_daily_mission_dual_reward_authority_v1.sql",
    "utf8"
  );


test(
  "daily mission supports plays points or both without Wallet",
  () => {
    assert.match(
      migration,
      /p_plays integer[\s\S]*p_points integer/i
    );

    assert.match(
      migration,
      /v_plays = 0[\s\S]*v_points = 0[\s\S]*DAILY_MISSION_REWARD_EMPTY/i
    );

    assert.doesNotMatch(
      migration,
      /cing_wallet|wallet_accounts|wallet_transactions|wallet_topup/i
    );
  }
);


test(
  "daily mission reward completion is atomic with both balances and ledgers",
  () => {
    assert.match(
      migration,
      /update public\.players[\s\S]*insert into[\s\S]*public\.daily_missions[\s\S]*public\.game_play_transactions[\s\S]*public\.point_transactions/i
    );
  }
);


test(
  "player row serializes reward balance mutation",
  () => {
    assert.match(
      migration,
      /from public\.players[\s\S]*where p\.user_id[\s\S]*for update/i
    );
  }
);


test(
  "mission idempotency is rechecked after player lock",
  () => {
    const playerLock =
      migration.indexOf(
        "from public.players p"
      );

    const missionLock =
      migration.indexOf(
        "from public.daily_missions m"
      );

    assert.ok(playerLock >= 0);
    assert.ok(missionLock > playerLock);

    assert.match(
      migration.slice(
        missionLock
      ),
      /if[\s\S]*found[\s\S]*v_existing\.completed[\s\S]*return query/i
    );
  }
);


test(
  "loyalty points remain exact integer-domain arithmetic",
  () => {
    assert.match(
      migration,
      /v_points_numeric <>[\s\S]*trunc\([\s\S]*v_points_numeric[\s\S]*2147483647/i
    );

    assert.match(
      migration,
      /2147483647 -[\s\S]*v_points/i
    );

    assert.match(
      migration,
      /points_awarded integer/i
    );
  }
);


test(
  "game plays reject overflow",
  () => {
    assert.match(
      migration,
      /2147483647 -[\s\S]*v_plays[\s\S]*DAILY_MISSION_GAME_PLAY_BALANCE_OVERFLOW/i
    );
  }
);


test(
  "reward snapshot is immutable completion evidence",
  () => {
    assert.match(
      migration,
      /reward_snapshot[\s\S]*jsonb_build_object\([\s\S]*'plays'[\s\S]*'points'[\s\S]*'label'/i
    );

    assert.match(
      migration,
      /reward_applied_at/i
    );
  }
);


test(
  "game-play ledger is bound to canonical mission identity",
  () => {
    assert.match(
      migration,
      /game_play_transactions_daily_mission_uq[\s\S]*reference_type[\s\S]*reference_id[\s\S]*reference_type = 'daily_mission'/i
    );

    assert.match(
      migration,
      /'daily_mission'[\s\S]*v_mission_id::text/i
    );
  }
);


test(
  "point ledger has canonical mission foreign key and uniqueness",
  () => {
    assert.match(
      migration,
      /point_transactions_mission_fk[\s\S]*foreign key[\s\S]*mission_id[\s\S]*references[\s\S]*public\.daily_missions\(id\)/i
    );

    assert.match(
      migration,
      /point_transactions_daily_mission_uq[\s\S]*mission_id[\s\S]*transaction_type = 'add'/i
    );
  }
);


test(
  "mission authority is backend only",
  () => {
    for (
      const role of [
        "public",
        "anon",
        "authenticated",
      ]
    ) {
      assert.match(
        migration,
        new RegExp(
          `revoke all on function[\\s\\S]*public\\.complete_daily_mission_atomic[\\s\\S]*from ${role};`,
          "i"
        )
      );
    }

    assert.match(
      migration,
      /grant execute on function[\s\S]*public\.complete_daily_mission_atomic[\s\S]*to service_role/i
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

    assert.match(
      migration.trim(),
      /^begin;[\s\S]*commit;$/i
    );
  }
);
