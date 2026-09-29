"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const root =
  path.resolve(
    __dirname,
    "../../../.."
  );

const points =
  fs.readFileSync(
    path.join(
      root,
      "routes/pointsRoutes.js"
    ),
    "utf8"
  );

const wallet =
  fs.readFileSync(
    path.join(
      root,
      "routes/walletRoutes.js"
    ),
    "utf8"
  );

function section(
  source,
  begin,
  end
) {
  const a =
    source.indexOf(begin);

  const b =
    source.indexOf(
      end,
      a
    );

  assert.ok(a >= 0);
  assert.ok(b > a);

  return source.slice(
    a,
    b
  );
}

const pointRoute =
  section(
    points,
    "// POST /api/points/buy-plays",
    "// POST /api/points/deduct"
  );

assert.match(
  pointRoute,
  /sendLegacyGamePlaysClosed\(res\)/
);

assert.doesNotMatch(
  pointRoute,
  /deductPoints|game_plays|addPlays|POINTS_PER_PLAY/
);

const walletRoute =
  section(
    wallet,
    'router.post(\n  "/buy-plays"',
    "/*\n * POST /api/wallet/buy-revive-credits"
  );

assert.match(
  walletRoute,
  /readCommittedWalletPlayPurchase/
);

assert.match(
  walletRoute,
  /sendLegacyGamePlaysClosed/
);

assert.doesNotMatch(
  walletRoute,
  /buyGamePlaysWithWallet/
);

assert.doesNotMatch(
  walletRoute,
  /isLegacyGamePlaysMutationDisabled/
);

assert.match(
  wallet,
  /router\.post\(\s*"\/buy-revive-credits",\s*authMiddleware/
);

console.log(
  "PASS: customer V1 play purchases are retired; Wallet replay preserved"
);
