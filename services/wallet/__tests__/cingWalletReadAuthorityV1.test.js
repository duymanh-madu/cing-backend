const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");


const route =
  fs.readFileSync(
    "routes/walletRoutes.js",
    "utf8"
  );

const service =
  fs.readFileSync(
    "services/wallet/cingWalletReadService.js",
    "utf8"
  );

const migration =
  fs.readFileSync(
    "db/migrations/20260827_cing_wallet_read_authority_v1.sql",
    "utf8"
  );


test(
  "wallet read endpoints require authenticated customer",
  () => {
    assert.match(
      route,
      /router\.get\([\s\S]*"\/"[\s\S]*authMiddleware[\s\S]*getWalletOverview/
    );

    assert.match(
      route,
      /router\.get\([\s\S]*"\/transactions"[\s\S]*authMiddleware[\s\S]*getWalletTransactions/
    );
  }
);


test(
  "wallet read identity derives only from authenticated customer phone",
  () => {
    assert.match(
      service,
      /resolveWalletReadUserId[\s\S]*normalizePhone\([\s\S]*customer\?\.phone/
    );

    assert.doesNotMatch(
      route,
      /req\.(?:body|params|query)[\s\S]{0,80}user_id/
    );

    /*
     * Public read entry points may derive an internal userId
     * only after receiving authenticated customer authority.
     *
     * What must never exist is caller-supplied userId in the
     * public function parameter contract.
     */
    assert.match(
      service,
      /async function getWalletOverview\(\{\s*customer,\s*historyLimit,\s*\}\)/
    );

    assert.match(
      service,
      /async function getWalletTransactions\(\{\s*customer,\s*limit,\s*cursor,\s*\}\)/
    );

    assert.doesNotMatch(
      service,
      /async function getWalletOverview\(\{[^}]*\buserId\b[^}]*\}\)/
    );

    assert.doesNotMatch(
      service,
      /async function getWalletTransactions\(\{[^}]*\buserId\b[^}]*\}\)/
    );
  }
);


test(
  "wallet read requires canonical player identity",
  () => {
    assert.match(
      service,
      /from\([\s\S]*"players"[\s\S]*\.eq\([\s\S]*"user_id"[\s\S]*userId/
    );

    assert.match(
      service,
      /CING_WALLET_PLAYER_NOT_FOUND/
    );
  }
);


test(
  "wallet account read is backend-only and scoped to canonical user",
  () => {
    assert.match(
      service,
      /from\([\s\S]*"cing_wallet_accounts"[\s\S]*\.eq\([\s\S]*"user_id"[\s\S]*userId/
    );

    assert.match(
      migration,
      /authenticated[\s\S]*cing_wallet_accounts[\s\S]*select[\s\S]*CING_WALLET_AUTHENTICATED_ACCOUNT_READ_SIDE_DOOR/i
    );

    assert.match(
      migration,
      /service_role[\s\S]*cing_wallet_accounts[\s\S]*select/i
    );
  }
);


test(
  "wallet ledger read is scoped to canonical user",
  () => {
    assert.match(
      service,
      /from\([\s\S]*"cing_wallet_transactions"[\s\S]*\.eq\([\s\S]*"user_id"[\s\S]*userId/
    );
  }
);


test(
  "wallet read never creates or mutates financial state",
  () => {
    assert.doesNotMatch(
      service,
      /\.insert\(/
    );

    assert.doesNotMatch(
      service,
      /\.update\(/
    );

    assert.doesNotMatch(
      service,
      /\.upsert\(/
    );

    assert.doesNotMatch(
      service,
      /\.delete\(/
    );

    assert.doesNotMatch(
      service,
      /\.rpc\(/
    );
  }
);


test(
  "unmaterialized wallet is represented as zero without DB mutation",
  () => {
    assert.match(
      service,
      /if \(!data\)[\s\S]*account_created:[\s\S]*false[\s\S]*balance:[\s\S]*0/
    );
  }
);


test(
  "wallet read rejects unsafe balance projection",
  () => {
    assert.match(
      service,
      /Number\.isSafeInteger\([\s\S]*balance[\s\S]*balance < 0/
    );

    assert.match(
      service,
      /CING_WALLET_BALANCE_INVALID/
    );
  }
);


test(
  "wallet history has bounded pagination",
  () => {
    assert.match(
      service,
      /DEFAULT_PAGE_SIZE\s*=\s*20/
    );

    assert.match(
      service,
      /MAX_PAGE_SIZE\s*=\s*50/
    );

    assert.match(
      service,
      /limit > MAX_PAGE_SIZE/
    );
  }
);


test(
  "wallet history uses stable keyset pagination",
  () => {
    assert.match(
      migration,
      /cing_wallet_transactions_user_created_id_idx[\s\S]*user_id[\s\S]*created_at desc[\s\S]*id desc/i
    );

    assert.match(
      service,
      /created_at\.lt\.\$\{decodedCursor\.created_at\}/
    );

    assert.match(
      service,
      /created_at\.eq\.\$\{decodedCursor\.created_at\}[\s\S]*id\.lt\.\$\{decodedCursor\.id\}/
    );

    assert.match(
      service,
      /\.order\([\s\S]*"created_at"[\s\S]*ascending:[\s\S]*false/
    );

    assert.match(
      service,
      /\.order\([\s\S]*"id"[\s\S]*ascending:[\s\S]*false/
    );
  }
);


test(
  "wallet history cursor is opaque and validated",
  () => {
    assert.match(
      service,
      /base64url/
    );

    assert.match(
      service,
      /CING_WALLET_HISTORY_CURSOR_INVALID/
    );

    assert.match(
      service,
      /\^\[0-9a-f\]\{8\}/i
    );
  }
);


test(
  "wallet API does not expose internal financial authority metadata",
  () => {
    const normalizedSection =
      service.slice(
        service.indexOf(
          "function normalizeWalletTransaction"
        ),
        service.indexOf(
          "async function readWalletAccountByUserId"
        )
      );

    assert.doesNotMatch(
      normalizedSection,
      /idempotency_key/
    );

    assert.doesNotMatch(
      normalizedSection,
      /actor_type/
    );

    assert.doesNotMatch(
      normalizedSection,
      /actor_id/
    );

    assert.doesNotMatch(
      normalizedSection,
      /metadata/
    );
  }
);


test(
  "client roles retain no direct wallet table read capability",
  () => {
    assert.match(
      migration,
      /has_table_privilege\([\s\S]*'anon'[\s\S]*'public\.cing_wallet_transactions'[\s\S]*'select'/
    );

    assert.match(
      migration,
      /has_table_privilege\([\s\S]*'authenticated'[\s\S]*'public\.cing_wallet_transactions'[\s\S]*'select'/
    );
  }
);
