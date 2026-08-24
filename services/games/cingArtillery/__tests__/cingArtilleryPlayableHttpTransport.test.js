"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const ROOT =
  path.resolve(
    __dirname,
    "../../../.."
  );

function read(
  relativePath
) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    "utf8"
  );
}

test(
  "Cing Piu Piu HTTP transport derives identity only from authenticated customer",
  () => {
    const source =
      read(
        "routes/cingArtilleryRoutes.js"
      );

    assert.match(
      source,
      /authMiddleware/u
    );

    assert.match(
      source,
      /req\.customer\?\.id/u
    );

    assert.doesNotMatch(
      source,
      /req\.body\?\.(?:user_id|userId)/u
    );

    assert.match(
      source,
      /router\.get\(\s*"\/entry"/u
    );

    assert.match(
      source,
      /router\.post\(\s*"\/onboarding"/u
    );

    assert.match(
      source,
      /router\.post\(\s*"\/session"/u
    );

    assert.match(
      source,
      /router\.post\(\s*"\/matchmaking"/u
    );
  }
);

test(
  "runtime profile and onboarding use effective gameplay access",
  () => {
    for (
      const relativePath of [
        "services/games/cingArtillery/services/cingArtilleryRuntimeProfileService.js",
        "services/games/cingArtillery/services/cingArtilleryOnboardingService.js",
      ]
    ) {
      const source =
        read(
          relativePath
        );

      assert.match(
        source,
        /requireEffectiveGameplayAccess/u
      );

      assert.doesNotMatch(
        source,
        /\brequireCingArtilleryEnabled\s*\(/u
      );
    }
  }
);

test(
  "account and gameplay-session creation use authorized admission RPCs",
  () => {
    const account =
      read(
        "services/games/cingArtillery/repositories/cingArtilleryAccountRepository.js"
      );

    const session =
      read(
        "services/games/cingArtillery/repositories/cingArtilleryGameplaySessionRepository.js"
      );

    assert.match(
      account,
      /cing_artillery_get_or_create_account_authorized_v1/u
    );

    assert.match(
      session,
      /cing_artillery_get_or_create_gameplay_session_authorized_v1/u
    );

    assert.doesNotMatch(
      account,
      /\.insert\s*\(/u
    );

    assert.doesNotMatch(
      session,
      /\.insert\s*\(/u
    );
  }
);

test(
  "Cing Piu Piu HTTP transport is mounted at canonical game path",
  () => {
    const source =
      read(
        "routes/index.js"
      );

    assert.match(
      source,
      /"\/game\/cing-piu-piu"[\s\S]*require\("\.\/cingArtilleryRoutes"\)/u
    );
  }
);
