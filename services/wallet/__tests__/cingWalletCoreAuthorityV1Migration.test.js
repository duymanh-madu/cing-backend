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
      process.cwd(),
      "db/migrations/20260826_cing_wallet_core_authority_v1.sql"
    ),
    "utf8"
  );

test(
  "Wallet V1 uses one canonical bigint non-negative balance",
  () => {
    assert.match(
      migration,
      /create table public\.cing_wallet_accounts[\s\S]*user_id text[\s\S]*primary key[\s\S]*balance bigint[\s\S]*balance >= 0/i
    );
  }
);

test(
  "Wallet V1 durable ledger enforces exact balance arithmetic",
  () => {
    assert.match(
      migration,
      /create table public\.cing_wallet_transactions/i
    );

    assert.match(
      migration,
      /balance_after\s*=\s*balance_before\s*\+\s*amount/i
    );

    assert.match(
      migration,
      /amount <> 0/i
    );
  }
);

test(
  "Wallet V1 has durable global idempotency",
  () => {
    assert.match(
      migration,
      /create unique index[\s\S]*cing_wallet_transactions_idempotency_uq[\s\S]*idempotency_key/i
    );

    assert.match(
      migration,
      /CING_WALLET_IDEMPOTENCY_CONFLICT/
    );
  }
);

test(
  "Wallet V1 serializes mutations on wallet row",
  () => {
    assert.match(
      migration,
      /from public\.cing_wallet_accounts[\s\S]*where user_id = v_user_id[\s\S]*for update/i
    );
  }
);

test(
  "Wallet V1 records ledger and balance projection in one database authority",
  () => {
    assert.match(
      migration,
      /insert into public\.cing_wallet_transactions[\s\S]*update public\.cing_wallet_accounts/i
    );

    assert.match(
      migration,
      /CING_WALLET_INSUFFICIENT_BALANCE/
    );
  }
);

test(
  "Wallet V1 supports required business transaction classes",
  () => {
    for (const type of [
      "topup",
      "topup_promotion",
      "payment",
      "refund",
      "reversal",
      "admin_adjustment",
    ]) {
      assert.match(
        migration,
        new RegExp(`'${type}'`)
      );
    }
  }
);

test(
  "Wallet tables are backend-readable but directly immutable",
  () => {
    assert.match(
      migration,
      /revoke all[\s\S]*cing_wallet_accounts[\s\S]*from service_role[\s\S]*grant select[\s\S]*cing_wallet_accounts[\s\S]*to service_role/i
    );

    assert.match(
      migration,
      /revoke all[\s\S]*cing_wallet_transactions[\s\S]*from service_role[\s\S]*grant select[\s\S]*cing_wallet_transactions[\s\S]*to service_role/i
    );
  }
);

test(
  "Wallet generic mutation primitive remains private from service role",
  () => {
    assert.match(
      migration,
      /create or replace function[\s\S]*cing_wallet_apply_mutation_private/i
    );

    assert.match(
      migration,
      /revoke all[\s\S]*cing_wallet_apply_mutation_private[\s\S]*from service_role/i
    );

    assert.doesNotMatch(
      migration,
      /grant execute[\s\S]*cing_wallet_apply_mutation_private[\s\S]*to service_role/i
    );
  }
);


test(
  "Wallet V1 enforces semantic transaction directions",
  () => {
    assert.match(
      migration,
      /cing_wallet_transactions_direction_ck[\s\S]*'topup'[\s\S]*'topup_promotion'[\s\S]*'refund'[\s\S]*amount > 0/i
    );

    assert.match(
      migration,
      /transaction_type = 'payment'[\s\S]*amount < 0/i
    );

    assert.match(
      migration,
      /CING_WALLET_TRANSACTION_DIRECTION_INVALID/
    );
  }
);

test(
  "Wallet V1 refuses accounts for unknown canonical users",
  () => {
    assert.match(
      migration,
      /perform 1[\s\S]*from public\.players[\s\S]*where user_id = v_user_id/i
    );

    assert.match(
      migration,
      /CING_WALLET_USER_NOT_FOUND/
    );
  }
);

test(
  "Wallet V1 supports arbitrary integer VND amounts down to one dong",
  () => {
    /*
     * Wallet stores VND in integer dong units.
     *
     * Examples that must remain valid:
     * 12,345 VND
     * 47,501 VND
     * 1 VND
     *
     * There must never be a divisibility / denomination
     * restriction such as multiples of 1,000 or 500.
     */
    assert.match(
      migration,
      /amount bigint/i
    );

    assert.match(
      migration,
      /balance bigint/i
    );

    assert.doesNotMatch(
      migration,
      /amount\s*%\s*(10|100|500|1000)/i
    );

    assert.doesNotMatch(
      migration,
      /mod\s*\(\s*amount\s*,\s*(10|100|500|1000)/i
    );

    const balanceBefore = 100000n;
    const payment = -12345n;
    const balanceAfter =
      balanceBefore + payment;

    assert.equal(
      balanceAfter,
      87655n
    );
  }
);


test(
  "Wallet V1 account identity is database-bound to canonical players",
  () => {
    assert.match(
      migration,
      /user_id text\s*primary key\s*references public\.players\(user_id\)\s*on update restrict\s*on delete restrict/i
    );
  }
);
