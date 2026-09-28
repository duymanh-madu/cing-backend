"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(
  __dirname,
  "../../../.."
);

function read(relative) {
  return fs.readFileSync(
    path.join(ROOT, relative),
    "utf8"
  );
}

const index = read(
  "routes/index.js"
);

const economy = read(
  "routes/cingGameEconomyV2Routes.js"
);

const bootstrap = read(
  "bootstrap/appBootstrap.js"
);

const bridge = read(
  "services/games/revival/__tests__/cingGameEconomyHttpBridgeV1.test.js"
);

const cutover = read(
  "services/games/revival/__tests__/cingGiftCutoverRailwayBoundaryV1.test.js"
);

test(
  "Economy V2 mounts at exact /api path",
  () => {
    assert.match(
      bootstrap,
      /app\.use\(\s*"\/api",\s*routes\s*\)/
    );

    assert.match(
      index,
      /router\.use\(\s*"\/game\/economy-v2",\s*require\("\.\/cingGameEconomyV2Routes"\)\s*\.createCingGameEconomyV2Router/
    );
  }
);

test(
  "existing auth middleware is injected",
  () => {
    assert.match(
      index,
      /authMiddleware:\s*require\("\.\.\/middlewares\/authMiddleware"\)/
    );

    assert.match(
      economy,
      /CING_GAME_ECONOMY_AUTH_REQUIRED/
    );
  }
);

test(
  "Economy V2 precedes generic /game route",
  () => {
    const economyAt = index.indexOf(
      '"/game/economy-v2"'
    );

    const genericAt = index.indexOf(
      '"/game",'
    );

    assert.ok(
      economyAt >= 0
    );

    assert.ok(
      genericAt > economyAt
    );
  }
);

test(
  "all customer Economy routes retain auth and gate",
  () => {
    const declarations = [
      '"/gifts/catalog"',
      '"/revive-credits/points"',
      '"/gifts/wallet"',
      '"/gifts/points"',
      '"/gifts/notifications"',
      '"/gifts/notifications/:notificationId/read"',
    ];

    for (const declaration of declarations) {
      const position =
        economy.indexOf(
          declaration
        );

      assert.ok(
        position >= 0,
        declaration
      );

      const section =
        economy.slice(
          position,
          position + 125
        );

      assert.match(
        section,
        /authMiddleware,\s*disabledGate,/
      );
    }
  }
);

test(
  "feature is default OFF unless explicitly true",
  () => {
    assert.match(
      economy,
      /process\.env\[ENABLE_FLAG\]\s*!==\s*"true"/
    );

    assert.match(
      economy,
      /CING_GAME_ECONOMY_NOT_ENABLED/
    );

    assert.match(
      economy,
      /return res\.status\(503\)/
    );
  }
);

test(
  "old pre-mount assertions are migrated",
  () => {
    assert.match(
      bridge,
      /createCingGameEconomyV2Router/
    );

    assert.match(
      cutover,
      /Economy V2 router mounted with default-OFF gate/
    );

    assert.doesNotMatch(
      cutover,
      /Economy V2 router remains unmounted/
    );
  }
);

test(
  "legacy Chess route remains mounted",
  () => {
    assert.match(
      index,
      /router\.use\("\/game\/chess",\s*customerMultiplayerGate,\s*require\("\.\/chessRoutes"\)\)/
    );
  }
);
