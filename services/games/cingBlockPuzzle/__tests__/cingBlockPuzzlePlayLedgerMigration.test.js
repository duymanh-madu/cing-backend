const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const path =
  require("path");

const migration =
  fs.readFileSync(
    path.join(
      __dirname,
      "../../../../db/migrations/20260822_cing_game_play_transaction_ledger_v1.sql"
    ),
    "utf8"
  );

test(
  "creates durable game play transaction ledger",
  () => {
    assert.match(
      migration,
      /create table public\.game_play_transactions/i
    );
  }
);

test(
  "ledger enforces exact balance arithmetic",
  () => {
    assert.match(
      migration,
      /balance_after\s*=\s*balance_before\s*\+\s*amount/i
    );
  }
);

test(
  "ledger deduction amount must be negative",
  () => {
    assert.match(
      migration,
      /transaction_type = 'deduct'[\s\S]*amount < 0/i
    );
  }
);

test(
  "gameplay session has unique durable mutation binding",
  () => {
    assert.match(
      migration,
      /create unique index[\s\S]*game_play_transactions_game_session_uq[\s\S]*game_key,[\s\S]*session_id/i
    );
  }
);

test(
  "client roles cannot access durable ledger directly",
  () => {
    for (
      const role of
      ["public", "anon", "authenticated"]
    ) {
      assert.match(
        migration,
        new RegExp(
          `revoke all\\s+on table public\\.game_play_transactions\\s+from ${role};`,
          "i"
        )
      );
    }
  }
);

test(
  "service role receives read-only ledger access",
  () => {
    const aclStart =
      migration.indexOf(
        "Ledger is backend-readable but mutations are authority-only."
      );

    const aclEnd =
      migration.indexOf(
        "Upgrade existing session-start authority"
      );

    assert.ok(
      aclStart >= 0
    );

    assert.ok(
      aclEnd > aclStart
    );

    const aclBlock =
      migration.slice(
        aclStart,
        aclEnd
      );

    assert.match(
      aclBlock,
      /revoke all\s+on table public\.game_play_transactions\s+from service_role;/i
    );

    assert.match(
      aclBlock,
      /grant select\s+on table public\.game_play_transactions\s+to service_role;/i
    );

    assert.doesNotMatch(
      aclBlock,
      /grant\s+(insert|update|delete|truncate|references|trigger)/i
    );
  }
);

test(
  "session start records authoritative minus one ledger entry",
  () => {
    assert.match(
      migration,
      /insert into public\.game_play_transactions[\s\S]*'deduct'[\s\S]*-1[\s\S]*'cing-block-puzzle'/i
    );
  }
);

test(
  "ledger records before and after play balances",
  () => {
    assert.match(
      migration,
      /v_balance_before[\s\S]*v_balance_after/i
    );

    assert.match(
      migration,
      /returning game_plays[\s\S]*into v_balance_after/i
    );
  }
);

test(
  "analytics compatibility projection is atomic with session start",
  () => {
    assert.match(
      migration,
      /insert into public\.analytics_events[\s\S]*'plays_deducted'/i
    );

    assert.match(
      migration,
      /'new_total'[\s\S]*v_balance_after/i
    );
  }
);

test(
  "session creation precedes ledger and analytics compatibility projection",
  () => {
    const session =
      migration.indexOf(
        "insert into public.cing_block_puzzle_sessions"
      );

    const ledger =
      migration.indexOf(
        "insert into public.game_play_transactions"
      );

    const analytics =
      migration.indexOf(
        "insert into public.analytics_events"
      );

    assert.ok(session >= 0);
    assert.ok(ledger > session);
    assert.ok(analytics > ledger);
  }
);

test(
  "start session authority remains security definer",
  () => {
    assert.match(
      migration,
      /language plpgsql\s+security definer\s+set search_path = public/i
    );
  }
);

test(
  "block puzzle compatibility event exposes history page fields",
  () => {
    for (
      const field of [
        "'amount'",
        "'reason'",
        "'new_total'",
        "'game_key'",
        "'session_id'",
      ]
    ) {
      assert.ok(
        migration.includes(field),
        `missing ${field}`
      );
    }
  }
);
