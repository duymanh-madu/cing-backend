"use strict";

const test =
  require("node:test");

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

const dbPath =
  path.join(
    root,
    "db/migrations/" +
      "20260929_cing_game_gift_admin_execute_activation_v1.sql"
  );

const mirrorPath =
  path.join(
    root,
    "supabase/migrations/" +
      "20260929140000_cing_game_gift_admin_execute_activation_v1.sql"
  );

const sql =
  fs.readFileSync(
    dbPath,
    "utf8"
  );

const mirror =
  fs.readFileSync(
    mirrorPath,
    "utf8"
  );

const executable =
  sql
    .replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    )
    .replace(
      /--[^\n]*/g,
      ""
    );

test(
  "exact SQL mirror",
  () => {
    assert.equal(
      sql,
      mirror
    );
  }
);

test(
  "exact Admin RPC activated for service_role",
  () => {
    assert.match(
      executable,
      /grant\s+execute\s+on\s+function\s+public\.cing_game_gift_catalog_admin_upsert_v1\s*\([\s\S]*?\)\s+to\s+service_role\s*;/i
    );
  }
);

test(
  "Admin RPC is revoked before narrow service_role grant",
  () => {
    assert.match(
      executable,
      /revoke\s+all\s+on\s+function\s+public\.cing_game_gift_catalog_admin_upsert_v1\s*\([\s\S]*?\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role\s*;/i
    );
  }
);

test(
  "customer Gift purchase RPCs are not activated",
  () => {
    for (const rpc of [
      "cing_game_gift_purchase_private_v1",
      "cing_game_gift_purchase_wallet_v1",
      "cing_game_gift_purchase_points_v1",
    ]) {
      const grant =
        new RegExp(
          String.raw`grant\s+execute[\s\S]*?${rpc}`,
          "i"
        );

      assert.doesNotMatch(
        executable,
        grant
      );
    }
  }
);

test(
  "client roles cannot execute Admin mutation RPC",
  () => {
    assert.match(
      executable,
      /CING_GAME_GIFT_ADMIN_ANON_EXECUTE_FORBIDDEN/
    );

    assert.match(
      executable,
      /CING_GAME_GIFT_ADMIN_AUTHENTICATED_EXECUTE_FORBIDDEN/
    );

    assert.doesNotMatch(
      executable,
      /grant\s+execute[\s\S]*?\bto\s+(?:public|anon|authenticated)\b/i
    );
  }
);

test(
  "exact Production RPC signature is guarded",
  () => {
    assert.match(
      executable,
      /cing_game_gift_catalog_admin_upsert_v1\(text,uuid,text,text,text,bigint,integer,boolean\)/
    );

    assert.match(
      executable,
      /CING_GAME_GIFT_ADMIN_UPSERT_RPC_MISSING/
    );
  }
);

test(
  "activation migration performs no Gift catalog mutation",
  () => {
    assert.doesNotMatch(
      executable,
      /\binsert\s+into\s+public\.cing_game_gift_catalog\b/i
    );

    assert.doesNotMatch(
      executable,
      /\bupdate\s+public\.cing_game_gift_catalog\b/i
    );

    assert.doesNotMatch(
      executable,
      /\bdelete\s+from\s+public\.cing_game_gift_catalog\b/i
    );

    assert.doesNotMatch(
      executable,
      /\bselect\s+public\.cing_game_gift_catalog_admin_upsert_v1\s*\(/i
    );
  }
);

test(
  "migration is transactional",
  () => {
    assert.match(
      executable,
      /^\s*begin\s*;/i
    );

    assert.match(
      executable,
      /commit\s*;\s*$/i
    );
  }
);
