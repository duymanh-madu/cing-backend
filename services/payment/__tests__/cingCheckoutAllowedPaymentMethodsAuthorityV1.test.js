"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const migration =
  fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../db/migrations/20260907_checkout_allowed_payment_methods_authority_v1.sql"
    ),
    "utf8"
  );

const checkout =
  fs.readFileSync(
    path.resolve(
      __dirname,
      "../../checkoutValidationService.js"
    ),
    "utf8"
  );

test(
  "app_configs receives canonical allowed payment methods field",
  () => {
    assert.match(
      migration,
      /alter table public\.app_configs[\s\S]*add column if not exists[\s\S]*allowed_payment_methods text\[\]/i
    );
  }
);

test(
  "baseline explicitly enables bank transfer MoMo and Cing Wallet",
  () => {
    assert.match(
      migration,
      /allowed_payment_methods[\s\S]*'bank_transfer'[\s\S]*'momo'[\s\S]*'cing_wallet'/i
    );
  }
);

test(
  "configuration has deterministic default and is non-null",
  () => {
    assert.match(
      migration,
      /alter column allowed_payment_methods[\s\S]*set default/i
    );

    assert.match(
      migration,
      /alter column allowed_payment_methods[\s\S]*set not null/i
    );
  }
);

test(
  "array validation is isolated in immutable SQL function",
  () => {
    assert.match(
      migration,
      /create or replace function[\s\S]*cing_checkout_payment_methods_valid_v1[\s\S]*returns boolean[\s\S]*language sql[\s\S]*immutable[\s\S]*strict/i
    );

    assert.match(
      migration,
      /from unnest\(p_methods\)/i
    );

    assert.match(
      migration,
      /count\(distinct method\.value\)/i
    );
  }
);

test(
  "table CHECK does not contain a PostgreSQL subquery",
  () => {
    assert.match(
      migration,
      /check\s*\(\s*public\.cing_checkout_payment_methods_valid_v1\(\s*allowed_payment_methods\s*\)\s*\)/i
    );

    const checkStart =
      migration.indexOf(
        "add constraint\n  app_configs_allowed_payment_methods_valid_ck"
      );

    assert.ok(checkStart >= 0);

    const checkRegion =
      migration.slice(checkStart);

    assert.doesNotMatch(
      checkRegion,
      /\bselect\b/i
    );

    assert.doesNotMatch(
      checkRegion,
      /\bunnest\s*\(/i
    );
  }
);

test(
  "malformed and duplicate payment methods fail validation",
  () => {
    assert.match(
      migration,
      /cardinality\(p_methods\) > 0/i
    );

    assert.match(
      migration,
      /btrim\(method\.value\) = ''/i
    );

    assert.match(
      migration,
      /method\.value <>[\s\S]*lower\(btrim\(method\.value\)\)/i
    );

    assert.match(
      migration,
      /count\(distinct method\.value\)/i
    );
  }
);

test(
  "validation helper is unavailable to client roles",
  () => {
    for (const role of [
      "public",
      "anon",
      "authenticated",
    ]) {
      assert.match(
        migration,
        new RegExp(
          `revoke all on function[\\s\\S]*cing_checkout_payment_methods_valid_v1\\(text\\[\\]\\)[\\s\\S]*from ${role}`,
          "i"
        )
      );
    }

    assert.match(
      migration,
      /grant execute on function[\s\S]*cing_checkout_payment_methods_valid_v1\(text\[\]\)[\s\S]*to service_role/i
    );
  }
);

test(
  "checkout continues consuming DB configuration authority",
  () => {
    assert.match(
      checkout,
      /Array\.isArray\([\s\S]*config\.allowed_payment_methods/i
    );

    assert.match(
      checkout,
      /allowedMethods\.includes\([\s\S]*payment_method/i
    );
  }
);

test(
  "Wallet is not hardcoded into application fallback",
  () => {
    const start =
      checkout.indexOf(
        "const allowedMethods ="
      );

    const end =
      checkout.indexOf(
        "if (",
        start
      );

    assert.ok(
      start >= 0 &&
      end > start
    );

    assert.doesNotMatch(
      checkout.slice(start, end),
      /cing_wallet/i
    );
  }
);

test(
  "migration does not mutate financial state",
  () => {
    assert.doesNotMatch(
      migration,
      /\b(update|insert into|delete from)\s+public\.(payment_transactions|cing_wallet_accounts|cing_wallet_transactions|orders|players|point_transactions)\b/i
    );
  }
);
