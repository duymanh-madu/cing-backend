"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const migration =
  fs.readFileSync(
    "db/migrations/20260827_cing_wallet_buy_game_plays_authority_v1.sql",
    "utf8"
  );


test(
  "Wallet play price is a DB policy with no hardcoded production default",
  () => {
    assert.match(
      migration,
      /add column if not exists wallet_play_price bigint;/
    );

    assert.match(
      migration,
      /wallet_play_price is null[\s\S]*or wallet_play_price > 0/
    );

    assert.doesNotMatch(
      migration,
      /wallet_play_price bigint\s+(?:not null\s+)?default\s+\d+/i
    );
  }
);


test(
  "Wallet play price is independent from commerce spend_per_play",
  () => {
    assert.match(
      migration,
      /select ac\.wallet_play_price/
    );

    assert.doesNotMatch(
      migration,
      /select[\s\S]{0,100}spend_per_play/i
    );
  }
);


test(
  "Wallet purchase accepts only user quantity and stable request identity",
  () => {
    assert.match(
      migration,
      /cing_wallet_purchase_game_plays_atomic_v1\(\s*p_user_id text,\s*p_quantity integer,\s*p_request_id uuid\s*\)/i
    );

    assert.doesNotMatch(
      migration,
      /p_unit_price/
    );

    assert.doesNotMatch(
      migration,
      /p_total_cost/
    );

    assert.doesNotMatch(
      migration,
      /p_wallet_balance/
    );
  }
);


test(
  "Wallet purchase reuses private canonical financial mutation authority",
  () => {
    assert.match(
      migration,
      /cing_wallet_apply_mutation_private\([\s\S]*'payment'[\s\S]*-v_total_cost/i
    );

    assert.doesNotMatch(
      migration,
      /update public\.cing_wallet_accounts/
    );

    assert.doesNotMatch(
      migration,
      /insert into public\.cing_wallet_transactions/
    );
  }
);


test(
  "purchase snapshot freezes quantity price and total cost",
  () => {
    assert.match(
      migration,
      /jsonb_build_object\([\s\S]*'quantity'[\s\S]*p_quantity[\s\S]*'unit_price'[\s\S]*v_unit_price[\s\S]*'total_cost'[\s\S]*v_total_cost/i
    );
  }
);


test(
  "idempotent replay uses frozen purchase snapshot instead of current price",
  () => {
    const replayPos =
      migration.indexOf(
        "Durable replay path"
      );

    const policyPos =
      migration.indexOf(
        "New purchase policy"
      );

    assert.ok(
      replayPos >= 0 &&
      policyPos > replayPos
    );

    const replay =
      migration.slice(
        replayPos,
        policyPos
      );

    assert.match(
      replay,
      /metadata[\s\S]*quantity[\s\S]*unit_price[\s\S]*total_cost/
    );

    assert.doesNotMatch(
      replay,
      /select ac\.wallet_play_price/
    );
  }
);


test(
  "Wallet debit and game-play credit are one PostgreSQL transaction",
  () => {
    const walletMutation =
      migration.indexOf(
        "cing_wallet_apply_mutation_private("
      );

    const playerUpdate =
      migration.indexOf(
        "update public.players",
        walletMutation
      );

    const playLedger =
      migration.indexOf(
        "insert into public.game_play_transactions",
        playerUpdate
      );

    const commit =
      migration.lastIndexOf(
        "commit;"
      );

    assert.ok(
      walletMutation >= 0 &&
      playerUpdate > walletMutation &&
      playLedger > playerUpdate &&
      commit > playLedger
    );
  }
);


test(
  "game-play purchase ledger has durable unique Wallet transaction identity",
  () => {
    assert.match(
      migration,
      /game_play_transactions_wallet_purchase_uq/
    );

    assert.match(
      migration,
      /reference_type = 'wallet_play_purchase'/
    );

    assert.match(
      migration,
      /v_wallet_tx\.id::text/
    );
  }
);


test(
  "concurrent replay cannot credit game plays twice",
  () => {
    assert.match(
      migration,
      /select \*[\s\S]*from public\.game_play_transactions gt[\s\S]*wallet_play_purchase[\s\S]*v_wallet_tx\.id::text[\s\S]*if found then[\s\S]*return query/i
    );
  }
);


test(
  "game-play balance mutation is serialized and overflow protected",
  () => {
    assert.match(
      migration,
      /from public\.players p[\s\S]*for update/
    );

    assert.match(
      migration,
      /2147483647::bigint/
    );

    assert.match(
      migration,
      /CING_WALLET_PLAY_PURCHASE_PLAY_BALANCE_OVERFLOW/
    );
  }
);


test(
  "insufficient Wallet balance is delegated to proven Wallet authority",
  () => {
    assert.match(
      migration,
      /cing_wallet_apply_mutation_private/
    );

    assert.doesNotMatch(
      migration,
      /balance\s*<\s*v_total_cost/
    );
  }
);


test(
  "authority is backend-only",
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
          `revoke all[\\s\\S]*cing_wallet_purchase_game_plays_atomic_v1[\\s\\S]*from ${role};`,
          "i"
        )
      );
    }

    assert.match(
      migration,
      /grant execute[\s\S]*cing_wallet_purchase_game_plays_atomic_v1[\s\S]*to service_role/i
    );
  }
);


test(
  "legacy loyalty-point buy-plays and reward domains are outside migration scope",
  () => {
    assert.doesNotMatch(
      migration,
      /public\.point_transactions/
    );

    assert.doesNotMatch(
      migration,
      /public\.daily_missions/
    );

    assert.doesNotMatch(
      migration,
      /public\.daily_challenges/
    );

    assert.doesNotMatch(
      migration,
      /(?:alter|update|insert\s+into|delete\s+from|create\s+(?:table|index)|drop\s+(?:table|index))[^;]*leaderboard/i
    );
  }
);


test(
  "migration is exactly one PostgreSQL transaction",
  () => {
    const begins =
      migration.match(
        /^\s*begin;\s*$/gmi
      ) || [];

    const commits =
      migration.match(
        /^\s*commit;\s*$/gmi
      ) || [];

    assert.equal(
      begins.length,
      1
    );

    assert.equal(
      commits.length,
      1
    );

    assert.ok(
      migration
        .trim()
        .toLowerCase()
        .startsWith("begin;")
    );

    assert.ok(
      migration
        .trim()
        .toLowerCase()
        .endsWith("commit;")
    );
  }
);
