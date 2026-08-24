"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const correctionPath =
  path.resolve(
    __dirname,
    "../../../../db/migrations/20260824_cing_artillery_private_beta_identity_text_v1.sql"
  );

const domainPath =
  path.resolve(
    __dirname,
    "../../../../db/migrations/20260814_cing_artillery_domain_foundation.sql"
  );

const onboardingPath =
  path.resolve(
    __dirname,
    "../../../../db/migrations/20260814_cing_artillery_onboarding_atomic.sql"
  );

const correction =
  fs.readFileSync(
    correctionPath,
    "utf8"
  );

const domain =
  fs.readFileSync(
    domainPath,
    "utf8"
  );

const onboarding =
  fs.readFileSync(
    onboardingPath,
    "utf8"
  );

function executable(
  source
) {
  return source
    .replace(
      /--[^\n]*/gu,
      " "
    )
    .replace(
      /\/\*[\s\S]*?\*\//gu,
      " "
    )
    .replace(
      /\s+/gu,
      " "
    )
    .trim();
}

const sql =
  executable(
    correction
  );

test(
  "canonical artillery user identity is text",
  () => {
    assert.match(
      executable(domain),
      /user_id text NOT NULL/iu
    );

    assert.match(
      executable(onboarding),
      /p_user_id text/iu
    );
  }
);

test(
  "beta membership identity is corrected from uuid to text",
  () => {
    assert.match(
      sql,
      /ALTER TABLE public\.cing_artillery_private_beta_access ALTER COLUMN user_id TYPE text USING user_id::text/iu
    );

    assert.match(
      sql,
      /CHECK\s*\(\s*btrim\(user_id\) <> ''\s*\)/iu
    );
  }
);

test(
  "legacy uuid beta RPC signatures are removed",
  () => {
    assert.match(
      sql,
      /DROP FUNCTION IF EXISTS public\.cing_artillery_has_private_beta_access_v1\s*\(\s*uuid\s*\)/iu
    );

    assert.match(
      sql,
      /DROP FUNCTION IF EXISTS public\.cing_artillery_set_private_beta_access_v1\s*\(\s*uuid,\s*boolean,\s*timestamptz,\s*timestamptz,\s*text\s*\)/iu
    );
  }
);

test(
  "beta read authority now consumes canonical text identity",
  () => {
    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_has_private_beta_access_v1\s*\(\s*p_user_id text\s*\)/iu
    );

    assert.match(
      sql,
      /b\.user_id = v_user_id/iu
    );

    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.cing_artillery_has_private_beta_access_v1\s*\(\s*text\s*\) TO service_role/iu
    );
  }
);

test(
  "beta mutation authority now consumes canonical text identity",
  () => {
    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION public\.cing_artillery_set_private_beta_access_v1\s*\(\s*p_user_id text/iu
    );

    assert.match(
      sql,
      /VALUES\s*\(\s*v_user_id,/iu
    );

    assert.match(
      sql,
      /ON CONFLICT\s*\(\s*user_id\s*\)\s*DO UPDATE/iu
    );
  }
);

test(
  "correction does not enable gameplay or provision testers",
  () => {
    assert.doesNotMatch(
      sql,
      /UPDATE public\.app_configs/iu
    );

    assert.doesNotMatch(
      sql,
      /cing_artillery_set_gameplay_enabled_atomic/iu
    );

    assert.doesNotMatch(
      sql,
      /0984966336|0961835636/u
    );
  }
);

test(
  "correction introduces no gameplay advantage authority",
  () => {
    for (
      const token
      of [
        "game_plays",
        "pending_rewards",
        "wallet",
        "max_hp",
        "damage",
        "inventory",
      ]
    ) {
      assert.doesNotMatch(
        sql,
        new RegExp(
          `\\b${token}\\b`,
          "iu"
        )
      );
    }
  }
);
