"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const service =
  fs.readFileSync(
    "services/wallet/cingWalletBuyGamePlaysService.js",
    "utf8"
  );

const route =
  fs.readFileSync(
    "routes/walletRoutes.js",
    "utf8"
  );


test(
  "wallet buy-plays endpoint requires authenticated customer",
  () => {
    assert.match(
      route,
      /router\.post\(\s*"\/buy-plays",\s*authMiddleware/
    );
  }
);


test(
  "wallet buy-plays route accepts only quantity and request identity",
  () => {
    const start =
      route.indexOf(
        'router.post(\n  "/buy-plays"'
      );

    const end =
      route.indexOf(
        "module.exports",
        start
      );

    assert.ok(
      start >= 0 &&
      end > start
    );

    const section =
      route.slice(
        start,
        end
      );

    assert.match(
      section,
      /req\.body\?\.quantity/
    );

    assert.match(
      section,
      /req\.body\?\.request_id/
    );

    assert.doesNotMatch(
      section,
      /req\.body\?\.user_id|req\.body\.user_id/
    );

    assert.doesNotMatch(
      section,
      /req\.body\?\.price|req\.body\.price/
    );

    assert.doesNotMatch(
      section,
      /req\.body\?\.amount|req\.body\.amount/
    );
  }
);


test(
  "wallet identity derives exclusively from authenticated customer phone",
  () => {
    assert.match(
      service,
      /normalizePhone\([\s\S]*customer\?\.phone/
    );

    assert.doesNotMatch(
      service,
      /customer\?\.user_id|customer\.user_id/
    );
  }
);


test(
  "service delegates financial and game-play mutation only to bounded PostgreSQL authority",
  () => {
    assert.match(
      service,
      /supabase\.rpc\(\s*"cing_wallet_purchase_game_plays_atomic_v1"/
    );

    assert.doesNotMatch(
      service,
      /\.from\(\s*"cing_wallet_accounts"\s*\)/
    );

    assert.doesNotMatch(
      service,
      /\.from\(\s*"cing_wallet_transactions"\s*\)/
    );

    assert.doesNotMatch(
      service,
      /\.from\(\s*"players"\s*\)[\s\S]*\.update/
    );

    assert.doesNotMatch(
      service,
      /\.from\(\s*"game_play_transactions"\s*\)/
    );
  }
);


test(
  "client cannot supply Wallet price or total cost",
  () => {
    assert.doesNotMatch(
      service,
      /p_unit_price|p_total_cost/
    );

    assert.match(
      service,
      /p_quantity:[\s\S]*normalizedQuantity/
    );

    assert.match(
      service,
      /p_request_id:[\s\S]*normalizedRequestId/
    );
  }
);


test(
  "purchase requires stable UUID request identity",
  () => {
    assert.match(
      service,
      /function normalizeRequestId/
    );

    assert.match(
      service,
      /\^\[0-9a-f\]\{8\}/i
    );

    assert.match(
      service,
      /CING_WALLET_PLAY_PURCHASE_REQUEST_ID_INVALID/
    );
  }
);


test(
  "quantity is positive int4-safe client input",
  () => {
    assert.match(
      service,
      /Number\.isSafeInteger\([\s\S]*quantity/
    );

    assert.match(
      service,
      /quantity <= 0/
    );

    assert.match(
      service,
      /2147483647/
    );
  }
);


test(
  "disabled DB policy maps to bounded non-success response",
  () => {
    assert.match(
      service,
      /CING_WALLET_PLAY_PURCHASE_PRICE_NOT_CONFIGURED/
    );

    assert.match(
      service,
      /statusCode:\s*503/
    );
  }
);


test(
  "insufficient Wallet balance is explicit and does not become generic success",
  () => {
    assert.match(
      service,
      /CING_WALLET_INSUFFICIENT_BALANCE/
    );

    assert.match(
      service,
      /statusCode:\s*409/
    );
  }
);


test(
  "existing wallet read and top-up route contracts remain present",
  () => {
    assert.match(
      route,
      /router\.get\(\s*"\/",\s*authMiddleware/
    );

    assert.match(
      route,
      /router\.get\(\s*"\/transactions",\s*authMiddleware/
    );

    assert.match(
      route,
      /router\.post\(\s*"\/topup\/session",\s*authMiddleware/
    );
  }
);


test(
  "wallet buy-plays endpoint does not touch loyalty points or reward domains",
  () => {
    assert.doesNotMatch(
      service,
      /point_transactions|deductPoints|addPoints|dailyMission|dailyChallenge|leaderboard/i
    );
  }
);
